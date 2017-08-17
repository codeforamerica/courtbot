var twilio = require('twilio');
var express = require('express');
var logfmt = require('logfmt');
var db = require('./db');
var dates = require("./utils/dates");
var rollbar = require('rollbar');
var emojiStrip = require('emoji-strip');


require('dotenv').config();

var app = express();

// Express Middleware
app.use(logfmt.requestLogger());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.cookieParser(process.env.COOKIE_SECRET));
app.use(express.cookieSession());


// Serve testing page on which you can impersonate Twilio
// (but not in production)
if (app.settings.env === 'development') {
  app.use(express.static('public'))
}

// Allows CORS
app.all('*', function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

// Enable CORS support for IE8.
app.get('/proxy.html', function (req, res) {
  res.send('<!DOCTYPE HTML>\n' + '<script src="http://jpillora.com/xdomain/dist/0.6/xdomain.min.js" master="http://www.courtrecords.alaska.gov"></script>');
});

app.get('/', function (req, res) {
  res.status(200).send('Hello, I am Courtbot. I have a heart of justice and a knowledge of court cases.');
});

// Fuzzy search that returns cases with a partial name match or
// an exact citation match
app.get('/cases', function (req, res, next) {
  if (!req.query || !req.query.q) return res.send(400);

  db.fuzzySearch(req.query.q)
  .then(data => {
    if (data) {
      data.forEach(function (d) {
        d.readableDate = dates.fromUtc(d.date).format('dddd, MMM Do');
      });
    }
    res.send(data);
  })
  .catch(err => next(err))
});

function askedReminderMiddleware(req, res, next) {
  if (isResponseYes(req.body.Body) || isResponseNo(req.body.Body)) {
    if (req.session.askedReminder) {
      req.askedReminder = true;
      req.match = req.session.match;
      return next();
    }
    db.findAskedQueued(req.body.From)
      .then(data => {
        if (data.length == 1) { //Only respond if we found one queue response "session"
          req.askedReminder = true;
          req.match = data[0];
        }
        next();
      })
      .catch(err => next(err))
  }
  else {
    next();
  }
}

// Respond to text messages that come in from Twilio
app.post('/sms', askedReminderMiddleware, function (req, res, next) {
  var twiml = new twilio.TwimlResponse();
  var text = cleanupText(req.body.Body.toUpperCase());
  if (req.askedReminder) {
    if (isResponseYes(text)) {
      db.addReminder({
        caseId: req.match.id,
        phone: req.body.From,
        originalCase: JSON.stringify(req.match)
      })
      .then(data => {
        twiml.sms('Sounds good. We will attempt to text you a courtesy reminder the day before your hearing date. Note that court schedules frequently change. You should always confirm your hearing date and time by going to ' + process.env.COURT_PUBLIC_URL);
        req.session.askedReminder = false;
        res.send(twiml.toString());
      })
      .catch(err => next(err))
    } else {
      twiml.sms('OK. You can always go to ' + process.env.COURT_PUBLIC_URL + ' for more information about your case and contact information.');
      req.session.askedReminder = false;
      res.send(twiml.toString());
    }
    return;
  }

  if (req.session.askedQueued) {
    if (isResponseYes(text)) {
      db.addQueued({
        citationId: req.session.citationId,
        phone: req.body.From
      })
      .then(date =>{
        twiml.sms('OK. We will keep checking for up to ' + process.env.QUEUE_TTL_DAYS + ' days. You can always go to ' + process.env.COURT_PUBLIC_URL + ' for more information about your case and contact information.');
        req.session.askedQueued = false;
        res.send(twiml.toString());
      })
      .catch(err => next(err))
      return;
    } else if (isResponseNo(text)) {
      twiml.sms('OK. You can always go to ' + process.env.COURT_PUBLIC_URL + ' for more information about your case and contact information.');
      req.session.askedQueued = false;
      res.send(twiml.toString());
      return;
    }
  }

  db.findCitation(text)
  .then(function(results) {
    if (!results || results.length === 0 || results.length > 1) {
      var correctLengthCitation = 6 <= text.length && text.length <= 25;
      if (correctLengthCitation) {
        twiml.sms('Could not find a case with that number. It can take several days for a case to appear in our system. Would you like us to keep checking for the next ' + process.env.QUEUE_TTL_DAYS + ' days and text you if we find it? (reply YES or NO)');

        req.session.askedQueued = true;
        req.session.citationId = text;
      } else {
        twiml.sms('Couldn\'t find your case. Case identifier should be 6 to 25 numbers and/or letters in length.');
      }
    } else {
      var match = results[0];
      var name = cleanupName(match.defendant);
      var datetime = dates.fromUtc(match.date);

      var caseInfo = 'Found a case for ' + name + ' scheduled on ' + datetime.format("ddd, MMM Do") + ' at ' + datetime.format("h:mm A") + ', at ' + match.room + '.';

      if ((datetime.diff(dates.now()) > 0) && (datetime.isSame(dates.now(), 'd'))) {
        twiml.sms(caseInfo + " Can\'t set reminders for hearings happening the same day.");
      } else {
        if (datetime.diff(dates.now()) <= 0) {
          twiml.sms(caseInfo + " It appears your hearing has already occurred.");
        } else {
          twiml.sms('Found a case for ' + name + ' scheduled on ' + datetime.format("ddd, MMM Do") + ' at ' + datetime.format("h:mm A") + ', at ' + match.room + '. Would you like a courtesy reminder the day before? (reply YES or NO)');

          req.session.match = match;
          req.session.askedReminder = true;
        }
      }
    }

    res.send(twiml.toString());

  })
  .catch(function(err){
    return next(err)
  })
});

var cleanupName = function (name) {
  name = name.trim();

  // Change FIRST LAST to First Last
  name = name.replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });

  return name;
};

function cleanupText (text) {
  text = text.replace(/[\r\n|\n].*/g, '');

  text = emojiStrip(text);
  text = text.trim();
  return text;
}

function isResponseYes(text) {
  text = text.toUpperCase().trim();
  return (text === 'YES' || text === 'YEA' || text === 'YUP' || text === 'Y');
}

function isResponseNo(text) {
  text = text.toUpperCase().trim();
  return (text === 'NO' || text === 'N');
}

// Error handling Middleware
app.use(function (err, req, res, next) {
  if (!res.headersSent) {
    // during development, return the trace to the client for
    // helpfulness
    console.log("Error: " + err.message);
    rollbar.handleError(err, req);
    if (app.settings.env !== 'production') {
      return res.status(500).send(err.stack);
    }

    return res.status(500).send('Sorry, internal server error');
  }
});
// Send all uncaught exceptions to Rollbar???
var options = {
  exitOnUncaughtException: true
};
rollbar.handleUncaughtExceptionsAndRejections(process.env.ROLLBAR_ACCESS_TOKEN, options);

var port = Number(process.env.PORT || 5000);
app.listen(port, function () {
  console.log("Listening on " + port);
});

module.exports = app;
