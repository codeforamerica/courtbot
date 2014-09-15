var sms = require('../lib/sms');
var db = require('../lib/db');

module.exports = function(req, res) {
  if (req.session.inReminderFlow) {
    handleReminderFlow(req, res);
    return;
  }

  if (req.session.inQueueFlow) {
    handleQueueFlow(req, res);
    return;
  }

  // If we're not handling one of the flows, try looking up the case.
  // If the case is found, and can be paid, let them know. If they can't pay,
  // offer reminders. If it's not found, offer to queue their case.
  var twiml, text = req.body.Body.toUpperCase();
  db.getCase(text, function(err, caseDetails) {
    if (err || !caseDetails) {
      twiml = sms.get('PROMPT_QUEUE');
      req.session.inQueueFlow = true;
      req.session.citation = text;
      return res.send(twiml);
    }

    if (eligibleToPay(caseDetails)) {
      twiml = sms.get('PROMPT_PAY', caseDetails);
      return res.send(twiml);
    }

    twiml = sms.get('PROMPT_REMINDER', caseDetails);
    req.session.inReminder = true;
    req.session.caseDetails = caseDetails;
    return res.send(twiml);
  });
};

function handleReminderFlow(req, res) {
  var twiml;
  var phone = req.body.From;
  var text = req.body.Body.toUpperCase();
  var caseDetails = req.session.caseDetails;

  if (sms.isYes(text)) {
    db.addReminder({
      case_id: caseDetails.case_id,
      phone: phone,
      original_case: caseDetails,
    }, function() {
      twiml = sms.get('CONFIRM_REMINDER', caseDetails);
      req.session.inReminderFlow = false;
      res.send(twiml);
    });
    return;
  }

  if (sms.isNo(text)) {
    twiml = sms.get('DECLINE_REMINDER', caseDetails);
    req.session.inReminderFlow = false;
    return res.send(twiml);
  }

  twiml = sms.get('YES_OR_NO_ONLY');
  return res.send(twiml);
}

function handleQueueFlow(req, res) {
  var twiml;
  var phone = req.body.From;
  var text = req.body.Body.toUpperCase();
  var citation = req.session.citation;

  if (sms.isYes(text)) {
    db.addQueued({
      citation_id: citation,
      phone: phone,
    }, function() {
      twiml = sms.get('CONFIRM_QUEUE');
      req.session.inQueueFlow = false;
      res.send(twiml);
    });
    return;
  }

  if (sms.isNo(text)) {
    twiml = sms.get('DECLINE_QUEUE');
    req.session.inQueueFlow = false;
    return res.send(twiml);
  }

  twiml = sms.get('YES_OR_NO_ONLY');
  return res.send(twiml);
}

// You can pay online if ALL your individual citations can be paid online
function eligibleToPay(courtCase) {
  var eligible = true;
  courtCase.citations.forEach(function(citation) {
    if (citation.payable !== '1') eligible = false;
  });
  return eligible;
}
