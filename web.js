var express = require("express");
var logfmt = require("logfmt");
var app = express();

var Knex = require('knex');
var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

// Require the Twilio module and create a REST client
var twilio = require('twilio');
var client = twilio('PN4f8d200af39a91f20272f96a5ba8b050', 'ACa1a2f0c274fa21513d4fa48b243bd14c');

// Express Middleware
app.use(logfmt.requestLogger());
app.use(express.json());
app.use(express.urlencoded());

app.get('/', function(req, res) {
  res.send('Hello World!');
});

// Respond to text messages that come in from Twilio
app.post('/sms', function(req, res) {
  var twiml = new twilio.TwimlResponse();

  knex('cases').where('citation', req.body.Body).select().then(function(results) {
    if (!results || results.length === 0) {
      twiml.sms('Sorry, we couldn\'t find that court case. Please call us at (404) 658-6940.');
    } else {
      var match = results[0];
      twiml.sms('We found a court case for' + match.defendent + 'on' + match.date + 'at' + match.time +'. If this isn\'t you, call us at (404) 658-6940.');
    }

    res.send(twiml.toString());
  });
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});

