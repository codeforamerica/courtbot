var crypto = require('crypto');
var twilio = require('twilio');
var client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
var Promise = require('bluebird');
var moment = require("moment");
var knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

/**
 * Find all reminders for which a reminder has not been sent.  
 *   1.)  cases.date should have been inserted as UTC for anchorage.  
 *   2.)  we must convert "now()" to UTC from wherever our server sits, then convert to anchorage from there.
 *   
 * @return {array} Promise to return results
 */
var findReminders = function() {

  return knex('reminders')
    .where('sent', false)
    .join('cases', 'reminders.case_id', '=', 'cases.id')
    //.whereRaw("\"cases\".\"date\"::date - " + "(now() AT TIME ZONE \'UTC\' AT TIME ZONE \'-9\')::date = 1")
    .whereRaw('("cases"."date" + interval \'8 hours\') < (now() + interval \'24 hours\')')
    .select();
};

/**
 * Send court appearance reminder via twilio REST API
 * 
 * @param  {array} reminders List of reminders to be sent. 
 * @return {Promise}  Promise to send reminders.
 */
function sendReminderMessages(reminders) {
  return new Promise(function(resolve, reject) {
    if (reminders.length === 0) {
      console.log('No reminders to send out today.');
      resolve();
    }

    var count = 0;

    // Send SMS reminder
    reminders.forEach(function(reminder) {
      var decipher = crypto.createDecipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
      var phone = decipher.update(reminder.phone, 'hex', 'utf8') + decipher.final('utf8');
      console.log("Phone: " + phone);

      client.sendMessage({
        to: phone,
        from: process.env.TWILIO_PHONE_NUMBER,
        body: 'Reminder: It appears you have a court case tomorrow at ' + moment("1980-01-01 " + reminder.time).format("h:mm A") +
        ' at ' + reminder.room + ". You should confirm your case date and time by going to ' + process.env.COURT_PUBLIC_URL + '. - Alaska State Court System"

      }, function(err, result) {
          if (err) {
            console.log(err);
          }
          console.log('Reminder sent to ' + reminder.phone);
          // Update table
          knex('reminders')
            .where('reminder_id', '=', reminder.reminder_id)
            .update({'sent': true})
            .asCallback(function(err, results) {
              if (err) {
                console.log(err);
              }
            }).then(function(err, data) {
            if (err) {
              console.log(err);
            }
            count++;
            if (count === reminders.length) {
              resolve();
            }
          });
        });
      });
    });
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
module.exports = function() {
  return new Promise(function(resolve, reject) {
    findReminders().then(function(resp) {
      sendReminderMessages(resp).then(resolve, reject);
    }).catch(reject);
  });
};
