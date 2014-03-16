var express = require("express");
var logfmt = require("logfmt");
var pg = require('pg');
var app = express();

app.use(logfmt.requestLogger());

pg.connect(process.env.DATABASE_URL, function(err, client, done) {
  if (err) return console.error(err);

  client.query('SELECT * FROM your_table', function(err, result) {
    done();
    if(err) return console.error(err);
    console.log(result.rows);
  });
});

app.get('/', function(req, res) {
  res.send('Hello World!');
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});