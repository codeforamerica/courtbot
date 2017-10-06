/* eslint "no-console": "off" */

const twilio = require('twilio');
const express = require('express');
const logfmt = require('logfmt');
const db = require('./db');
const dates = require('./utils/dates');
const rollbar = require('rollbar');
const emojiStrip = require('emoji-strip');
const messages = require('./utils/messages.js');

require('dotenv').config();

const app = express();

// Express Middleware
app.use(logfmt.requestLogger());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.cookieParser(process.env.COOKIE_SECRET));
app.use(express.cookieSession());


// Serve testing page on which you can impersonate Twilio
// (but not in production)
if (app.settings.env === 'development' || app.settings.env === 'test') {
  app.use(express.static('public'));
}

// Allows CORS
app.all('*', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'X-Requested-With');
  next();
});

// Enable CORS support for IE8.
app.get('/proxy.html', (req, res) => {
  res.send('<!DOCTYPE HTML>\n<script src="http://jpillora.com/xdomain/dist/0.6/xdomain.min.js" master="http://www.courtrecords.alaska.gov"></script>');
});

app.get('/', (req, res) => {
  res.status(200).send(messages.iAmCourtBot());
});

// Fuzzy search that returns cases with a partial name match or
// an exact citation match
app.get('/cases', (req, res, next) => {
  if (!req.query || !req.query.q) {
    return res.send(400);
  }

  return db.fuzzySearch(req.query.q)
    .then((data) => {
      if (data) {
        data.forEach((d) => {
          d.readableDate = dates.fromUtc(d.date).format('dddd, MMM Do'); /* eslint "no-param-reassign": "off" */
        });
      }
      return res.send(data);
    })
    .catch(err => next(err));
});

/**
 * strips line feeds, returns, and emojis from string and trims it
 *
 * @param  {String} text incoming message to evaluate
 * @return {String} cleaned up string
 */
function cleanupText(text) {
  text = text.replace(/[\r\n|\n].*/g, '');
  return emojiStrip(text).trim();
}

/**
 * checks for an affirmative response
 *
 * @param  {String} text incoming message to evaluate
 * @return {Boolean} true if the message is an affirmative response
 */
function isResponseYes(text) {
  text = text.toUpperCase().trim();
  return (text === 'YES' || text === 'YEA' || text === 'YUP' || text === 'Y');
}

/**
 * checks for negative or declined response
 *
 * @param  {String} text incoming message to evaluate
 * @return {Boolean} true if the message is a negative response
 */
function isResponseNo(text) {
  text = text.toUpperCase().trim();
  return (text === 'NO' || text === 'N');
}

/**
 * Change FIRST LAST to First Last
 *
 * @param  {String} name name to manipulate
 * @return {String} propercased name
 */
function cleanupName(name) {
  return name.trim()
    .replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}


function askedReminderMiddleware(req, res, next) {
  if (isResponseYes(req.body.Body) || isResponseNo(req.body.Body)) {
    if (req.session.askedReminder) {
      req.askedReminder = true;
      req.match = req.session.match;
      next();
      return;
    }
    db.findAskedQueued(req.body.From)
      .then((data) => {
        if (data.length === 1) { // Only respond if we found one queue response "session"
          req.askedReminder = true;
          req.match = data[0];
        }
        next();
      })
      .catch(err => next(err));
  } else {
    next();
  }
}

// Respond to text messages that come in from Twilio
app.post('/sms', askedReminderMiddleware, (req, res, next) => {
  const twiml = new twilio.TwimlResponse();
  const text = cleanupText(req.body.Body.toUpperCase());
  if (req.askedReminder) {
    if (isResponseYes(text)) {
      db.addReminder({
        caseId: req.match.id,
        phone: req.body.From,
        originalCase: JSON.stringify(req.match),
      })
        .then(() => {
          twiml.sms(messages.weWillRemindYou());
          req.session.askedReminder = false;
          res.send(twiml.toString());
        })
        .catch(err => next(err));
    } else {
      twiml.sms(messages.forMoreInfo());
      req.session.askedReminder = false;
      res.send(twiml.toString());
    }
    return;
  }

  if (req.session.askedQueued) {
    if (isResponseYes(text)) {
      db.addQueued({
        citationId: req.session.citationId,
        phone: req.body.From,
      })
        .then(() => {
          twiml.sms(messages.weWillKeepLooking());
          req.session.askedQueued = false;
          res.send(twiml.toString());
        })
        .catch(err => next(err));
      return;
    } else if (isResponseNo(text)) {
      twiml.sms(messages.forMoreInfo());
      req.session.askedQueued = false;
      res.send(twiml.toString());
      return;
    }
  }

  db.findCitation(text)
    .then((results) => {
      if (!results || results.length === 0 || results.length > 1) {
        const correctLengthCitation = text.length >= 6 && text.length <= 25;
        if (correctLengthCitation) {
          twiml.sms(messages.notFoundAskToKeepLooking());

          req.session.citationId = text;
          req.session.askedQueued = true;
          req.session.askedReminder = false;
        } else {
          twiml.sms(messages.invalidCaseNumber());
        }
      } else {
        const match = results[0];
        const name = cleanupName(match.defendant);
        const datetime = dates.fromUtc(match.date);

        twiml.sms(messages.foundItAskForReminder(false, name, datetime, match.room));

        req.session.match = match;
        req.session.askedReminder = true;
        req.session.askedQueued = false;
      }

      res.send(twiml.toString());
    })
    .catch(err => next(err));
});

// Error handling Middleware
app.use((err, req, res, next) => {
  if (!res.headersSent) {
    console.log('Error: ', err.message);
    rollbar.handleError(err, req);

    // during development, return the trace to the client for helpfulness
    if (app.settings.env !== 'production') {
      res.status(500).send(err.stack);
      return;
    }

    res.status(500).send('Sorry, internal server error');
  }
});

// Send all uncaught exceptions to Rollbar???
const options = {
  exitOnUncaughtException: true,
};
rollbar.handleUncaughtExceptionsAndRejections(process.env.ROLLBAR_ACCESS_TOKEN, options);

const port = Number(process.env.PORT || 5000);
app.listen(port, () => {
  console.log('Listening on ', port);
});

module.exports = app;
