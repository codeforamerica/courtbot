var crypto = require('crypto');
var Knex = require('knex');
var twilio = require('twilio');
var client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
var Promise = require('bluebird');

var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

// Finds reminders for cases happening tomorrow
var findReminders = function() {
  return knex('reminders')
    .where('sent', false)
    .join('cases', 'reminders.case_id', '=', 'cases.id')
    .whereRaw('??::date= ?',['cases.date', 'tomorrow'])
    .select();
};

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

      client.sendMessage({
        to: phone,
        from: process.env.TWILIO_PHONE_NUMBER,
        body: 'Reminder: You\'ve got a court case tomorrow at ' + reminder.time +
              ' in court room ' + reminder.room +
              '. Call us at (907) XXX-XXXX with any questions. - Alaska State Court System'

      }, function(err, result) {
        if (err) {
          console.log(err);
        }
        console.log('Reminder sent to ' + reminder.phone);
        // Update table
        knex('reminders')
          .where('reminder_id', '=', reminder.reminder_id)
          .update({'sent': true})
          .exec(function(err, results) {
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
};

module.exports = function() {
  return new Promise(function(resolve, reject) {
    findReminders().then(function(resp) {
      sendReminderMessages(resp).then(resolve, reject);
    }).catch(reject);
  });
};
