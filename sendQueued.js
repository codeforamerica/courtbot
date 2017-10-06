/* eslint "no-console": "off" */

const db = require('./db.js');
const dates = require('./utils/dates');
const strings = require('./utils/strings');
const messages = require('./utils/messages');
const manager = require('./utils/db/manager');

const knex = manager.knex;

/**
 * Retrieve array of queued messages that have not been sent, if any exist.
 *
 * @return {Promise} Promise to return an array of queued messages that have not been sent
 */
function findQueued() {
  return knex('queued')
    .where('sent', false)
    .select();
}

/**
 * Find a citation that is related to a queued message.
 *
 * @param  {Object}  queuedMessage for which we want to lookup citation data.
 * @return {Promise} promise to retrieve citation data.
 */
function retrieveCitation(queuedMessage) {
  return db.findCitation(queuedMessage.citation_id)
    .then(results => ({
      queuedMessage,
      citationFound: results.length > 0,
      relatedCitation: (results.length ? results[0] : false),
    }));
}

/**
 * Update queued message in db to indicate it has been sent, and that a reminder will be sent.
 *
 * @param  {string} queuedId index by which to lookup queued message for update.
 * @return {Promise} function to recieve results and Promise to perform update.
 */
function updateSentWithReminder(queuedId) {
  return knex('queued')
    .where('queued_id', '=', queuedId)
    .update({ sent: true,
      asked_reminder: true,
      asked_reminder_at: dates.now().format(),
    });
}

/**
 * Update data for queued message to indicate it has been sent but no reminder is required.
 *
 * @param  {string} queuedId index to be used for lookup of queued message when updating.
 * @return {function} function to recieve results and Promise to perform update.
 */
function updateSentWithoutReminder(queuedId) {
  return knex('queued')
    .where('queued_id', '=', queuedId)
    .update({ sent: true });
}

/**
 * Process citation:
 *   1.)  Citation data found:  send message to defendant asking if they want a reminder
 *   2.)  Citation data not found and message has been queued too long:
 *        send a "not found" message to defendant.
 *   3.)  N/A do nothing and leave queued.
 *
 * @param  {Object} queued queued message and citation data(if found)
 * @return {Promise} promise to process queued message (if applicable)
 */
function processCitationMessage(queued) {
  const phone = db.decryptPhone(queued.queuedMessage.phone);
  if (queued.citationFound) {
    const name = strings.scrubName(queued.relatedCitation.defendant);
    const datetime = dates.fromUtc(queued.relatedCitation.date);
    return messages.send(phone, process.env.TWILIO_PHONE_NUMBER, messages.foundItAskForReminder(true, name, datetime, queued.relatedCitation.room))
      .then(() => updateSentWithReminder(queued.queuedMessage.queued_id));
  } else if (dates.hasSatTooLong(queued.queuedMessage.created_at)) {
    return messages.send(phone, process.env.TWILIO_PHONE_NUMBER, messages.unableToFindCitationForTooLong())
      .then(() => updateSentWithoutReminder(queued.queuedMessage.queued_id));
  }

  return false;
}

/**
 * Hook for processing all applicable queued messages.
 *
 * @return {Promise} Promise to process all queued messages.
 */
function sendQueued() {
  return findQueued()
    .then(resultsArray => Promise.all(resultsArray.map(r => retrieveCitation(r))))
    .then(resultsArray => Promise.all(resultsArray.map(r => processCitationMessage(r))));
}

module.exports = {
  sendQueued,
};
