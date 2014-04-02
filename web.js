var twilio = require('twilio');
var Knex = require('knex');
var express = require('express');
var logfmt = require('logfmt');
var moment = require('moment');
var app = express();

var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

// Express Middleware
app.use(logfmt.requestLogger());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.cookieParser());
app.use(express.cookieSession({ secret: 'devsecret234' }));

// Allows CORS
app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

app.get('/', function(req, res) {
  res.send('Hello World!');
});

// Get a list of court cases that match either
// a citation number of a given name. To make it
// automatically query against both.
app.get('/cases', function(req, res) {
  if (!req.query || !req.query.searchParameter) return res.send(400);
  
  // Split the name so we can search more strategically
  var param = req.query.searchParameter.toUpperCase();
  var params = param.split(" ");

  // Search for Names
  var query = knex('cases').where('defendant', 'like', '%' + params[0] + '%');
  if (params.length > 1) query = query.andWhere('defendant', 'like', '%' + params[1] + '%')

  // Search for Citations
  var query = query.orWhere('citation', 'like', '%' + params[0] + '%');

  // Limit to ten results
  var query = query.limit(10);

  query.exec(function(err, data) {
    res.send(data);
  })
});

// Respond to text messages that come in from Twilio
app.post('/sms', function(req, res) {
  var twiml = new twilio.TwimlResponse();
  var text = req.body.Body.toUpperCase();

  if (req.session.askedReminder) {
    if (text === 'YES') {
      var match = req.session.match;
      knex('reminders').insert({
        citation: match.citation,
        sent: false,
        phone: req.body.From,
        date: match.date
      }).exec(function() {});

      twiml.sms('Sounds good. We\'ll text you a day before your case. Call us at (404) 658-6940 with any other questions.');
      req.session.askedReminder = false;
      res.send(twiml.toString());
    } else if (text === 'NO') {
      twiml.sms('Alright, no problem. See you on your court date. Call us at (404) 658-6940 with any other questions.');
      req.session.askedReminder = false;
      res.send(twiml.toString());
    }
  }

  knex('cases').where('citation', text).select().then(function(results) {
    if (!results || results.length === 0) {
      twiml.sms('Sorry, we couldn\'t find that court case. Please call us at (404) 658-6940.');
    } else {
      var match = results[0];
      var name = cleanupName(match.defendant);
      var date = moment(match.date).format('dddd, MMM Do');
      twiml.sms('Found a court case for ' + name + ' on ' + date + ' at ' + match.time +'. Go to courtroom ' + match.room +'. Would you like a reminder the day before?');

      req.session.match = match;
      req.session.askedReminder = true;
    }

    res.send(twiml.toString());
  });
});

var cleanupName = function(name) {
  // Switch LAST, FIRST to FIRST LAST
  var bits = name.split(',');
  name = bits[1] + ' ' + bits[0];
  name = name.trim();

  // Change FIRST LAST to First Last
  name = name.replace(/\w\S*/g, function(txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });

  return name;
}

// Enable CORS support for IE8. 
app.get('/proxy.html', function(req, res) {
  res.send('<!DOCTYPE HTML>\n' + '<script src="http://jpillora.com/xdomain/dist/0.6/xdomain.min.js" master="http://www.atlantamunicipalcourt.org"></script>');
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});

