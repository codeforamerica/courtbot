var crypto = require('crypto');
var Knex = require('knex');
var twilio = require('twilio');
var client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
var db = require('./db.js');
var Promise = require('bluebird');
var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});
var moment = require('moment');


// Finds reminders for cases happening tomorrow
var findQueued = function() {
  return knex('queued')
    .where('sent', false)
    .select();
};

function sendQueuedMessage(queued) {
  return new Promise(function (resolve, reject) {
    if (queued.length === 0) {
      console.log('No queued messages to send today.');
      resolve();
    }

    var count = 0;
    queued.forEach(function(queuedCitation) {
      db.findCitation(queuedCitation.citation_id, function(err, results) {
        var decipher = crypto.createDecipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
        var phone = decipher.update(queuedCitation.phone, 'hex', 'utf8') + decipher.final('utf8');

        if (results && results.length > 0) {
          var match = results[0];
          var name = cleanupName(match.defendant);
          var date = moment(match.date).format('dddd, MMM Do');
          var body = 'Your Alaska State Court information was found: a court case for ' + name + ' on ' + date + ' at ' + match.time + ', in courtroom ' + match.room + '. Call us at (907) XXX-XXXX with any questions.';
          client.sendMessage({
            to: phone,
            from: process.env.TWILIO_PHONE_NUMBER,
            body: body
          }, function(err, result) {
            if (err) {
              return console.log("client.sendMessage", err);
            }

            console.log('Queued message sent to ' + phone);

            knex('queued')
              .where('queued_id', '=', queuedCitation.queued_id)
              .update({'sent': true})
              .exec(function(err, results) {
                if (err) {
                  console.log(err);
                }

                count++;

                if (count === queued.length) {
                  resolve();
                }
              });
          });
        } else {
          console.log("Now: " + moment().format('dddd, MMM Do') + ", Created: " + queuedCitation.created_at);
          var daysSinceCreation = moment().diff(moment(queuedCitation.created_at), 'days');
          console.log('Queued message created ' + daysSinceCreation + ' days ago.');

          var ALLOWABLE_QUEUED_DAYS = 16;
          if (daysSinceCreation > ALLOWABLE_QUEUED_DAYS) {
            knex('queued')
              .where('queued_id', '=', queuedCitation.queued_id)
              .update({'sent': true})
              .exec(function(err, results) {
                if (err) {
                  console.log(err);
                }
              });

            client.sendMessage({
              to: phone,
              from: process.env.TWILIO_PHONE_NUMBER,
              body: 'We haven\'t been able to find your court case. Please call us at (907) XXX-XXXX. - Alaska State Court System',
            }, function(err, result) {
              if (err) {
                return console.log(err);
              }
              count++;
              if (count === queued.length) {
                resolve();
              }
            });
          } else {
            count++;
            if (count === queued.length) {
              resolve();
            }
          }
        }
      });
    });
  });
}

var cleanupName = function(name) {
  // Switch LAST, FIRST to FIRST LAST
  // var bits = name.split(',');
  // name = bits[1] + ' ' + bits[0];  // Alaska already has this format
  name = name.trim();

  // Change FIRST LAST to First Last
  name = name.replace(/\w\S*/g, function(txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });

  return name;
};

module.exports = function() {
  return new Promise(function(resolve, reject) {
    findQueued().then(function(resp) {
      sendQueuedMessage(resp).then(resolve, reject);
    }).catch(reject);
  });
};
