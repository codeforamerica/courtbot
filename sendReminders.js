/* eslint "no-console": "off" */

const crypto = require('crypto');
const manager = require('./utils/db/manager');
const messages = require('./utils/messages');
const dates = require('./utils/dates');

const knex = manager.knex();

/**
 * Find all reminders with a case date of tomorrow for which a reminder has not been sent
 *
 * @return {array} Promise to return results
 */
function findReminders() {
  // database is converting dates to UTC, so we need to
  // convert our comparison date to UTC prior to comparing.
  const todayMidnight = dates.now().add('1', 'days').hour(0).minute(0)
    .utcOffset(0)
    .format();
  const tomorrowMidnight = dates.now().add('2', 'days').hour(0).minute(0)
    .utcOffset(0)
    .format();
  return knex('reminders')
    .where('sent', false)
    .join('cases', 'reminders.case_id', '=', 'cases.id')
    .whereRaw(`(date (cases.date at time zone '${process.env.TIMEZONE}') <= date '${tomorrowMidnight}' at time zone '${process.env.TIMEZONE}')
                AND (date (cases.date at time zone '${process.env.TIMEZONE}') > date '${todayMidnight}' at time zone '${process.env.TIMEZONE}')`)
    .select();
}

/**
 * Send court appearance reminder via twilio REST API
 *
 * @param  {array} reminders List of reminders to be sent.
 * @return {Promise}  Promise to send reminders.
 */
function sendReminder(reminder) {
  // Be careful when refactoring this function, the decipher object needs to be created
  //    each time a reminder is sent because the decipher.final() method destroys the object
  //    Reference: https://nodejs.org/api/crypto.html#crypto_decipher_final_output_encoding
  const decipher = crypto.createDecipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  const phone = decipher.update(reminder.phone, 'hex', 'utf8') + decipher.final('utf8');
  console.log('Phone: ', phone);

  return messages.send(phone, process.env.TWILIO_PHONE_NUMBER, messages.reminder(reminder))
    .then(() => reminder);
}

/**
 * Update statuses of reminders that we send messages for.
 *
 * @param  {Object} reminder reminder record that needs to be updated in db.
 * @return {Promise} Promise to update reminder.
 */
function updateReminderStatus(reminder) {
  console.log('Reminder sent to ', reminder.phone);
  return knex('reminders')
    .where('reminder_id', '=', reminder.reminder_id)
    .update({ sent: true });
}

/**
 * Main function for executing:
 *   1.)  The retrieval of court date reminders
 *   2.)  Sending reminder messages via twilio
 *   3.)  Updating the status of the court reminder messages
 *
 * @return {Promise} Promise to send messages and update statuses.
 */
function sendReminders() {
  return findReminders()
    .then(resultArray => Promise.all(resultArray.map(r => sendReminder(r))))
    .then(resultArray => Promise.all(resultArray.map(r => updateReminderStatus(r))));
}

module.exports = {
  findReminders,
  sendReminder,
  sendReminders,
  updateReminderStatus,
};
