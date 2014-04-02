var Knex = require('knex');
var twilio = require('twilio');
var client = twilio('ACa1a2f0c274fa21513d4fa48b243bd14c', '24a4142517de019719dae425082e8fbe');
var moment = require('moment');

var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

// Get todays date, chopping off hours and minutes
var today = moment(moment().format('YYYY-MM-DD'));

var sendReminders = function() {
  return knex('reminders').where('sent', false).select().then(function(results) {
    console.log(results);
    results.forEach(function(r) {
      // Only send reminders if the case is happening tomorrow
      var caseDate = moment(r.date);
      var diff = caseDate.diff(today, 'days', true);
      if (diff !== 1) return;

      knex('reminders').where('id', r.id).update({sent: true}).exec(function() {});

      client.sendMessage({
        to: r.phone,
        from: '+14157809338',
        body: 'Reminder: You\'ve got a court case tomorrow at 3pm in court room 6D. Call us at (404) 658-6940 with any questions. -Atlanta Municipal Court',
      }, function(err, responseData) {
        console.log(err);
      });
    });
  });
};

sendReminders().exec(function() {
  console.log('Daily reminders sent.');
});

