/* eslint "no-console": "off" */
require('dotenv').config();
const MessagingResponse = require('twilio').twiml.MessagingResponse;
const express = require('express');
const cookieSession = require('cookie-session')
const bodyParser = require('body-parser')
const db = require('./db');
const emojiStrip = require('emoji-strip');
const messages = require('./utils/messages.js');
const moment = require("moment-timezone");
const onHeaders = require('on-headers');
const log = require('./utils/logger')
const web_log = require('./utils/logger/hit_log')
const web_api = require('./web_api/routes');
const action_symbol = Symbol.for('action');

const app = express();

/* Express Middleware */

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(cookieSession({
    name: 'session',
    secret: process.env.COOKIE_SECRET,
    signed: false, // causing problems with twilio -- investigating
}));

/* makes json print nicer for /cases */
app.set('json spaces', 2);

/* Serve testing page on which you can impersonate Twilio (but not in production) */
if (app.settings.env === 'development' || app.settings.env === 'test') {
    app.use(express.static('public'));
}

/* Allows CORS */
app.all('*', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With, Authorization, Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
    onHeaders(res, web_log)
    next();
});

/* Enable CORS support for IE8. */
app.get('/proxy.html', (req, res) => {
    res.send('<!DOCTYPE HTML>\n<script src="http://jpillora.com/xdomain/dist/0.6/xdomain.min.js" master="http://www.courtrecords.alaska.gov"></script>');
});

app.get('/', (req, res) => {
    res.status(200).send(messages.iAmCourtBot());
});

/* Add routes for api access */
app.use('/api', web_api);

/* Fuzzy search that returns cases with a partial name match or
   an exact citation match
*/
app.get('/cases', (req, res, next) => {
    if (!req.query || !req.query.q) {
        return res.sendStatus(400);
    }

    return db.fuzzySearch(req.query.q)
    .then((data) => {
      if (data) {
        data.forEach((d) => {
            d.readableDate = moment(d.date).format('dddd, MMM Do'); /* eslint "no-param-reassign": "off" */
        });
      }
      return res.json(data);
    })
    .catch(err => next(err));
});

/**
 * Twilio Hook for incoming text messages
 */
app.post('/sms',
    cleanupTextMiddelWare,
    stopMiddleware,
    deleteMiddleware,
    yesNoMiddleware,
    currentRequestMiddleware,
    caseIdMiddleware,
    unservicableRequest
);

 /* Middleware functions */

/**
 * Strips line feeds, returns, and emojis from string and trims it
 *
 * @param  {String} text incoming message to evaluate
 * @return {String} cleaned up string
 */
function cleanupTextMiddelWare(req,res, next) {
    let text = req.body.Body.replace(/[\r\n|\n].*/g, '');
    req.body.Body = emojiStrip(text).trim().toUpperCase();
    next()
}

/**
 * Checks for 'STOP' text. We will recieve this if the user requests that twilio stop sending texts
 * All further attempts to send a text (inlcuding responing to this text) will fail until the user restores this.
 * This will delete any requests the user currently has (alternatively we could mark them inactive and reactiveate if they restart)
 */
function stopMiddleware(req, res, next){
    const stop_words = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END','QUIT']
    const text = req.body.Body
    if (!stop_words.includes(text)) return next()

    db.deactivateRequestsFor(req.body.From)
    .then(case_ids => {
        res[action_symbol] = "stop"
        return res.sendStatus(200); // once stopped replies don't make it to the user
    })
    .catch(err => next(err));
}

/**
 *  Handles cases when user has send a yes or no text.
 */
function yesNoMiddleware(req, res, next) {
    // Yes or No resonses are only meaningful if we also know the citation ID.
    if (!req.session.case_id) return next()

    const twiml = new MessagingResponse();
    if (isResponseYes(req.body.Body)) {
        db.addRequest({
            case_id: req.session.case_id,
            phone: req.body.From,
            known_case: req.session.known_case
        })
        .then(() => {
            twiml.message(req.session.known_case ? messages.weWillRemindYou() : messages.weWillKeepLooking() );
            res[action_symbol] = req.session.known_case? "schedule_reminder" : "schedule_unmatched"
            req.session = null;
            req.session = null;
            res.send(twiml.toString());
        })
        .catch(err => next(err));
    } else if (isResponseNo(req.body.Body)) {
        res[action_symbol] = "decline_reminder"
        twiml.message(req.session.known_case ? messages.repliedNo(): messages.repliedNoToKeepChecking());
        req.session = null;
        res.send(twiml.toString());
    } else{
        next()
    }
}

/**
 * Handles cases where user has entered a case they are already subscribed to
 * and then type Delete
 */
function deleteMiddleware(req, res, next) {
    // Delete response is only meaningful if we have a delete_case_id.
    const case_id = req.session.delete_case_id
    const phone = req.body.From
    if (!case_id || req.body.Body !== "DELETE") return next()
    res[action_symbol] = "delete_request"
    const twiml = new MessagingResponse();
    db.deactivateRequest(case_id, phone)
    .then(() => {
        req.session = null;
        twiml.message(messages.weWillStopSending(case_id))
        res.send(twiml.toString());
    })
    .catch(err => next(err));
}

/**
 * Responds if the sending phone number is alreay subscribed to this case_id=
 */
function currentRequestMiddleware(req, res, next) {
    const text = req.body.Body
    const phone = req.body.From
    if (!possibleCaseID(text)) return next()
    db.findRequest(text, phone)
    .then(results => {
        if (!results || results.length === 0) return next()

        const twiml = new MessagingResponse();
        // looks like they're already subscribed
        res[action_symbol] = "already_subscribed"
        req.session.delete_case_id = text
        twiml.message(messages.alreadySubscribed(text))
        res.send(twiml.toString());
    })
    .catch(err => next(err));
}

/**
 * If input looks like a case number handle it
 */
function caseIdMiddleware(req, res, next){
    const text = req.body.Body
    if (!possibleCaseID(text)) return next()
    const twiml = new MessagingResponse();

    db.findCitation(req.body.Body)
    .then(results => {
        if (!results || results.length === 0){
            // Looks like it could be a citation that we don't know about yet
            res[action_symbol] = "unmatched_case"
            twiml.message(messages.notFoundAskToKeepLooking());
            req.session.known_case = false;
            req.session.case_id = text;
        } else {
            // They sent a known citation!
            res[action_symbol] = "found_case"
            twiml.message(messages.foundItAskForReminder(results[0]));
            req.session.case_id = text;
            req.session.known_case = true;
        }
        res.send(twiml.toString());
    })
    .catch(err => next(err));
}

/**
 * None of our middleware could figure out what to do with the input
 * [TODO: create a better message to help users use the service]
 */
function unservicableRequest(req, res, next){
    // this would be a good place for some instructions to the user
    res[action_symbol] = "unusable_input"
    const twiml = new MessagingResponse();
    twiml.message(messages.invalidCaseNumber());
    res.send(twiml.toString());
}

/* Utility helper functions */

/**
 * Test message to see if it looks like a case id.
 * Currently alphan-numeric plus '-' between 6 and 25 characters
 * @param {String} text
 */
function possibleCaseID(text) {
    /*  From AK Court System:
        - A citation must start with an alpha letter (A-Z) and followed 
          by only alpha (A-Z) and numeric (0-9) letters with a length of 8-17.   
        - Case number must start with a number (1-4) 
          and have a length of 14 exactly with dashes.
    */     
   
    const citation_rx = /^[A-Za-z][A-Za-z0-9]{7,16}$/
    const case_rx = /^[1-4][A-Za-z0-9-]{13}$/
    return case_rx.test(text) ||  citation_rx.test(text);
}

/**
 * Checks for an affirmative response
 *
 * @param  {String} text incoming message to evaluate
 * @return {Boolean} true if the message is an affirmative response
 */
function isResponseYes(text) {
    return (text === 'YES' || text === 'YEA' || text === 'YUP' || text === 'Y');
}

/**
 * Checks for negative or declined response
 *
 * @param  {String} text incoming message to evaluate
 * @return {Boolean} true if the message is a negative response
 */
function isResponseNo(text) {
    return (text === 'NO' || text === 'N');
}


/* Error handling Middleware */
app.use((err, req, res, next) => {
    if (!res.headersSent) {
        log.error(err);

        // during development, return the trace to the client for helpfulness
        if (app.settings.env !== 'production') {
            res.status(500).send(err.stack);
            return;
        }
        res.status(500).send('Sorry, internal server error');
    }
});

/* Send all uncaught exceptions to Rollbar??? */
const options = {
    exitOnUncaughtException: true,
};

const port = Number(process.env.PORT || 5000);
app.listen(port, () => {
    log.info(`Listening on port ${port}`);
});

module.exports = app;
