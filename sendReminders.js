var crypto = require('crypto');
var twilio = require('twilio');
var client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
var Promise = require('bluebird');
var TIMESTAMPTZ_OID = 1184;
require("pg").types.setTypeParser(TIMESTAMPTZ_OID, require("./utils/dates").pgDateParser);
var knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL
});
var decipher = crypto.createDecipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
var messages = require("./utils/messages");
var dates = require("./utils/dates");
var promises = require("./utils/promises"),
    forEachResult = promises.forEachResult,
    callbackHandler = promises.genericCallbackResolver;



/**
 * Find all reminders for which a reminder has not been sent.  
 *   1.)  If the date of the case is less than now + 2 days, then it is tomorrow or before tomorrow.
 *   
 * @return {array} Promise to return results
 */
module.exports.findReminders = function() {
  var dayAfterTomorrow = dates.now().add("2", "days").format();
  return knex('reminders')
    .where('sent', false)
    .join('cases', 'reminders.case_id', '=', 'cases.id')
    .whereRaw('date ("cases"."date") < date \'' + dayAfterTomorrow + '\'')
    .select();
};

/**
 * Send court appearance reminder via twilio REST API
 * 
 * @param  {array} reminders List of reminders to be sent. 
 * @return {Promise}  Promise to send reminders.
 */
var sendReminder = function(reminder) {
  return new Promise(function(resolve, reject) {
    var phone = decipher.update(reminder.phone, 'hex', 'utf8') + decipher.final('utf8');
    console.log("Phone: " + phone);

    messages.send(phone, process.env.TWILIO_PHONE_NUMBER, messages.reminder(reminder))
      .then(function() {
        resolve(reminder);
      });
  });
};

/**
 * Update statuses of reminders that we send messages for.
 * 
 * @param  {Object} reminder reminder record that needs to be updated in db.
 * @return {Promise} Promise to update reminder.
 */
var updateReminderStatus = function(reminder) {
  console.log('Reminder sent to ' + reminder.phone);
  return new Promise(function(resolve, reject) {
    knex('reminders')
      .where('reminder_id', '=', reminder.reminder_id)
      .update({'sent': true})
      .asCallback(callbackHandler(resolve, "updateReminderStatus()"));
  });  
};

/**
 * Main function for executing: 
 *   1.)  The retrieval of court date reminders
 *   2.)  Sending reminder messages via twilio
 *   3.)  Updating the status of the court reminder messages
 *   
 * @return {Promise} Promise to send messages and update statuses.
 */
module.exports.sendReminders = function() {
  return new Promise(function(resolve, reject) {
    module.exports.findReminders()
      .then(forEachResult(sendReminder))
      .then(forEachResult(updateReminderStatus))
      .then(resolve, reject);
    });
};
