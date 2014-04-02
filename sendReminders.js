var Knex = require('knex');
var twilio = require('twilio');
var client = twilio('ACa1a2f0c274fa21513d4fa48b243bd14c', '24a4142517de019719dae425082e8fbe');

var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

// get all the cases that haven't been sent
// check each to see if it's happening tomorrow
// if it is tomorrow, send the reminder
var sendReminders = function() {
  return knex('reminders').where('sent', false).select().then(function(results) {
    console.log(results);
    results.forEach(function(r) {
      client.sendMessage({
        to: r.phone,
        from: '+14157809338',
        body: 'word to your mother',
      }, function(err, responseData) {
        console.log(err);
      });
    });
  });
};

sendReminders().exec(function() {
  console.log('Daily reminders sent.');
});

