var crypto = require('crypto');
var manager = require("./utils/db/manager");
var knex = manager.knex();
var messages = require("./utils/messages");
var dates = require("./utils/dates");



/**
 * Find all reminders for which a reminder has not been sent.
 *   1.)  If the date of the case is less than now + 2 days, then it is tomorrow or before tomorrow.
 *
 * @return {array} Promise to return results
 */
module.exports.findReminders = function() {
  //database is converting dates to UTC offset 0 (+8 hours), so we need to convert our comparrison date
  //to UTC prior to comparing.
  //
  //Checking for anything before tomorrow's midnight.
  var tomorrowMidnight = dates.now().add("2", "days").hour(0).minute(0).utcOffset(0).format();
  var todayMidnight = dates.now().add("1", "days").hour(0).minute(0).utcOffset(0).format();
  //console.log("DAT", tomorrowMidnight);
  return knex('reminders')
    .where('sent', false)
    .join('cases', 'reminders.case_id', '=', 'cases.id')
    .whereRaw(`(date (cases.date at time zone '${process.env.TIMEZONE}') <= date '${tomorrowMidnight}' at time zone '${process.env.TIMEZONE}')
                AND (date (cases.date at time zone  '${process.env.TIMEZONE}') > date '${todayMidnight}' at time zone '${process.env.TIMEZONE}')`)
    .select();
};

/**
 * Send court appearance reminder via twilio REST API
 *
 * @param  {array} reminders List of reminders to be sent.
 * @return {Promise}  Promise to send reminders.
 */
var sendReminder = function(reminder) {
    // Be careful when refactoring this function, the decipher object needs to be created
    //    each time a reminder is sent because the decipher.final() method destroys the object
    //    Reference: https://nodejs.org/api/crypto.html#crypto_decipher_final_output_encoding
    var decipher = crypto.createDecipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
    var phone = decipher.update(reminder.phone, 'hex', 'utf8') + decipher.final('utf8');
    console.log("Phone: " + phone);

    return messages.send(phone, process.env.TWILIO_PHONE_NUMBER, messages.reminder(reminder))
      .then(function() {
        return reminder;
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
  return knex('reminders')
      .where('reminder_id', '=', reminder.reminder_id)
      .update({'sent': true})
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
  return module.exports.findReminders()
      .then(resultArray => Promise.all(resultArray.map(r => sendReminder(r))))
      .then(resultArray => Promise.all(resultArray.map(r => updateReminderStatus(r))))
};
