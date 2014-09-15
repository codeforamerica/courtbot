var express = require('express');
var logfmt = require('logfmt');
var app = express();
var handleSearch = require('./routes/web');
var handleTwilio = require('./routes/twilio');

// Express Middleware
app.use(logfmt.requestLogger());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.cookieParser(process.env.COOKIE_SECRET));
app.use(express.cookieSession());

// Allows CORS
app.all('*', function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'X-Requested-With');
  next();
});

// Enable CORS support for IE8. 
app.get('/proxy.html', function(req, res) {
  res.send('<!DOCTYPE HTML>\n' + '<script src="http://jpillora.com/xdomain/dist/0.6/xdomain.min.js" master="http://court.atlantaga.gov"></script>');
});

app.get('/', function(req, res) {
  res.send('Hello, I am Courtbot. I have a heart of justice and a knowledge of court cases.');
});

app.get('/cases', handleSearch);
app.post('/sms', handleTwilio);

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log('Listening on ' + port);
});
