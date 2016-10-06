var crypto = require('crypto'),
    twilio = require('twilio'),
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN),
    db = require('./db.js'),
    Promise = require('bluebird'),
    moment = require('moment-timezone'),
    dates = require("./utils/dates"),
    strings = require("./utils/strings"),
    messages = require("./utils/messages"),
    promises = require("./utils/promises"),
    forEachResult = promises.forEachResult,
    chainable = promises.chainablePromise,
    knex = require('knex')({
      client: 'pg',
      connection: process.env.DATABASE_URL
    });

/**
 * Retrieve array of queued messages that have not been sent, if any exist.
 * 
 * @return {Promise} Promise to return an array of queued messages that have not been sent
 */
var findQueued = function() {
  return knex('queued')
    .where('sent', false)
    .select();
};

/**
 * Find a citation that is related to a queued message.
 * 
 * @param  {Object} queuedMessage for which we want to lookup citation data.
 * @return {Promise}  promise to retrieve citation data.
 */
function retrieveCitation(queuedMessage) {
  return new Promise(function(resolve, reject) {
    db.findCitation(queuedMessage.citation_id, function(err, results) {
      resolve({
        queuedMessage: queuedMessage,
        citationFound: results.length > 0,
        relatedCitation: (results.length ? results[0] : false)
      });
    });
  });
};

/**
 * Process citation:
 *   1.)  Citation data found:  send message to defendant asking if they want a reminder
 *   2.)  Citation data not found and message has been queued too long:  send a "not found" message to defendant.
 *   3.)  N/A do nothing and leave queued.
 * 
 * @param  {Object} queued queued message and citation data(if found)
 * @return {Promise} promise to process queued message (if applicable)
 */
function processCitationMessage(queued) {
  return new Promise(function(resolve, reject) {
    var decipher = crypto.createDecipher('aes256', process.env.PHONE_ENCRYPTION_KEY),
        phone = decipher.update(queued.queuedMessage.phone, 'hex', 'utf8') + decipher.final('utf8');

    if (queued.citationFound) {
      var name = strings.scrubName(queued.relatedCitation.defendant),
          datetime = dates.fromDateAndTime(queued.relatedCitation.date, queued.relatedCitation.time);

      Promise.resolve()
        .then(sendMessage(phone, process.env.TWILIO_PHONE_NUMBER, messages.greetingMessage(name, datetime, queued.relatedCitation.room)))
        .then(updateSentWithReminder(queued.queuedMessage.queued_id))
        .then(resolve);
    } else if (dates.hasSatTooLong(queued.queuedMessage.created_at)) {
      Promise.resolve()
        .then(sendMessage(phone, process.env.TWILIO_PHONE_NUMBER, messages.unableToFindCitationForTooLong()))
        .then(updateSentWithoutReminder(queued.queuedMessage.queued_id))
        .then(resolve);
    } else {
      resolve();
    }
  });
};

/**
 * Send a twilio message
 * 
 * @param  {string} to   phone number message will be sent to
 * @param  {string} from who the message is being sent from
 * @param  {string} body message to be sent
 * @return {Promise} Promise to send message.
 */
function sendMessage(to, from, body) {
  return chainable(function(resolve, reject) {
    client.sendMessage({to: to, from: from, body: body}, genericResolver(resolve, "client.sendMessage"));
  });
};

/**
 * Update queued message in db to indicate it has been sent, and that a reminder will be sent.
 * 
 * @param  {string} queuedId index by which to lookup queued message for update.    
 * @return {Promise} function to recieve results and Promise to perform update.
 */
function updateSentWithReminder(queuedId) {
    return chainable(function(resolve, reject) {
        knex('queued')
          .where('queued_id', '=', queuedId)
          .update({'sent': true,
                    'asked_reminder': true,
                    'asked_reminder_at' : dates.now()})
          .asCallback(genericResolver(resolve, "updateSentWithReminder()"));
    });
};

/**
 * Update data for queued message to indicate it has been sent but no reminder is required.
 * 
 * @param  {string} queuedId index to be used for lookup of queued message when updating.
 * @return {function} function to recieve results and Promise to perform update.
 */
function updateSentWithoutReminder(queuedId) {
    return chainable(function(resolve, reject) {
        knex('queued')
          .where('queued_id', '=', queuedId)
          .update({'sent': true})
          .asCallback(genericResolver(resolve, "updateSentWithoutReminder()"));
    });
};

/**
 * Generic callback handler for resolving a promise once a call has completed.
 * 
 * @param  {function} resolve resolve function for Promise that is to be resolved.
 * @param  {string} errPrefix String prefix for error message if call fails and an error is returned.
 */
function genericResolver(resolve, errPrefix) {
  return function(err, result) {
    if (err) {
      return console.log(errPrefix, err);
    }
    resolve(result);
  };
};

/**
 * Hook for processing all applicable queued messages.
 * 
 * @return {Promise} Promise to process all queued messages.
 */
module.exports = function() {
  return new Promise(function(resolve, reject) {
    findQueued()
      .then(forEachResult(retrieveCitation))
      .then(forEachResult(processCitationMessage))
      .then(resolve, reject)
      .catch(reject);
  });
};