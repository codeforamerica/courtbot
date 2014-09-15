var db = require('./db');
var sms = require('sms');
var moment = require('moment');

var QUEUE_DAY_LIMITATION = 16;

// queuedCase fields: queued_id, created_at, citation_id, phone, sent
// caseDetail fields:

// TODO: move the sending bit back here. sms only handles the text content

function resolveQueuedCase(queuedCase) {
  var daysAgo = moment().diff(moment(queuedCase.created_at), 'days');

  db.findCase(queuedCase.citation_id, function(err, caseDetails) {
    if (!caseDetails && daysAgo >= QUEUE_DAY_LIMITATION) {
      sms.sendQueuedFailure(queuedCase);
      db.resolveQueued(queuedCase.queued_id);
    }
    
    if (!caseDetails) return;
    sms.sendQueuedSuccess(queuedCase);
    db.resolveQueued(queuedCase.queued_id);
  });
}

db.getAllQueued(function(queued) {
  console.log('Attempted to resolve ', queued.length, ' queued cases.');
  queued.forEach(resolveQueuedCase);
});

// exports.sendQueuedFailure = function(queuedCase) {
//   var phone = decryptPhone(queuedCase.phone);
//   var body = template.compose(queuedCase);

//   client.sendMessage({
//     to: phone,
//     from: process.env.TWILIO_PHONE_NUMBER,
//     body: body,
//   });
// };

// exports.sendQueuedSuccess = function(queuedCase) {
// };

