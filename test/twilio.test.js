var test = require('tape');
var db = require('../lib/db');
var sms = require('../lib/sms');
var twilio = require('../routes/twilio');

test('Texting an unknown citation prompts to look it up later', function(t) {
  t.plan(1);

  var req = {
    body: { Body: 'fake-citation-number', From: '532-555-2343' },
    session: {}
  };
  var res = {
    send: function(body) {
      t.deepEqual(body, sms.get('PROMPT_QUEUE'));
    }
  };

  twilio(req, res);
});

test('Texting citation that can be paid prompts to pay', function(t) {
  t.plan(1);

  var knownPayableCitation = '4576430';
  var knownPayableCase = {
    date: new Date('2014-08-06'),
    defendant: 'SNOWDEN, DAVID KYLE',
    id: '00cd7dd44ef7ea4e835aba224ea4fdc489431c35',
    room: '6A',
    time: '08:00:00 AM'
  };

  var req = {
    body: { Body: knownPayableCitation, From: '532-555-2343' },
    session: {}
  };
  var res = {
    send: function(body) {
      t.deepEqual(body, sms.get('PROMPT_PAY', knownPayableCase));
    }
  };

  twilio(req, res);
});

test('Texting a unpayable citation prompts for reminders', function(t) {
  t.plan(1);

  var knownCitation = '4763337';
  var knownCase = {
    date: new Date('Wed Aug 27 2014 17: 00: 00 GMT - 0700(PDT)'),
    defendant: 'CATES, LAYLA ADRIANE',
    id: '000766abed3260573dea250eb5510d9d3b463430',
    room: '5A',
    time: '08:00:00 AM'
  };

  var req = {
    body: { Body: knownCitation, From: '532-555-2343' },
    session: {}
  };
  var res = {
    send: function(body) {
      t.deepEqual(body, sms.get('PROMPT_REMINDER', knownCase));
    }
  };

  twilio(req, res);
});

test('Texting yes confirms a reminder request', function(t) {
  t.plan(2);

  var req = {
    body: { Body: 'yes', From: '532-555-2343' },
    session: { inReminderFlow: 'yes', caseDetails: { case_id: 'doesntmatter' } }
  };
  var res = {
    send: function(body) {
      t.deepEqual(body, sms.get('CONFIRM_REMINDER'));
      t.false(req.session.inReminderFlow);
    }
  };

  twilio(req, res);
});

test('Texting no declines a reminder request', function(t) {
  t.plan(2);

  var req = {
    body: { Body: 'no', From: '532-555-2343' },
    session: { inReminderFlow: 'yes', caseDetails: { case_id: 'doesntmatter' } }
  };
  var res = {
    send: function(body) {
      t.deepEqual(body, sms.get('DECLINE_REMINDER'));
      t.false(req.session.inReminderFlow);
    }
  };

  twilio(req, res);
});

test('Texting any other than yes or no during a question prompts clarification', function(t) {
  t.plan(2);

  var req = {
    body: { Body: 'hello', From: '532-555-2343' },
    session: { inReminderFlow: 'yes', caseDetails: { case_id: 'doesntmatter' } }
  };
  var res = {
    send: function(body) {
      t.deepEqual(body, sms.get('YES_OR_NO_ONLY'));
      t.true(req.session.inReminderFlow);
    }
  };

  twilio(req, res);
});

test('Texting yes accepts a queue prompt', function(t) {
  t.plan(2);

  var req = {
    body: { Body: 'yes', From: '532-555-2343' },
    session: { inQueueFlow: 'yes', citation: 'doesntmatter' }
  };
  var res = {
    send: function(body) {
      t.deepEqual(body, sms.get('CONFIRM_QUEUE'));
      t.false(req.session.inQueueFlow);
    }
  };

  twilio(req, res);
});

test('Texting yes accepts a queue prompt', function(t) {
  t.plan(2);

  var req = {
    body: { Body: 'no', From: '532-555-2343' },
    session: { inQueueFlow: 'yes', citation: 'doesntmatter' }
  };
  var res = {
    send: function(body) {
      t.deepEqual(body, sms.get('DECLINE_QUEUE'));
      t.false(req.session.inQueueFlow);
    }
  };

  twilio(req, res);
});

test('Closing the database', function(t) {
  db.close();
  t.end();
});
