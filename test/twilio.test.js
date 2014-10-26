var test = require('tape');
var db = require('../lib/db');
var sms = require('../lib/sms');
var twilio = require('../routes/twilio');
var knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

var knownCitation = '1234567890';
var knownCase = {
  date: new Date('Wed Aug 27 2014 17: 00: 00 GMT'),
  defendant: 'CATES, LAYLA ADRIANE',
  id: 'test00000000000',
  room: '5A',
  time: '08:00:00 AM',
  citations: JSON.stringify([{"id": knownCitation,"violation":"40-6-181(D)","description":"SPEEDING 15 to 18 MPH OVER","location":"AVON AVE","payable":"0"}])
};

var knownPayableCitation = '0987654321';
var knownPayableCase = {
  date: new Date('Wed Aug 27 2014 17: 00: 00 GMT'),
  defendant: 'SNOWDEN, DAVID KYLE',
  id: 'test1111111111',
  room: '6A',
  time: '08:00:00 AM',
  citations: JSON.stringify([{"id": knownPayableCitation,"violation":"40-6-181(D)","description":"SPEEDING 15 to 18 MPH OVER","location":"AVON AVE","payable":"1"}])
};


test('Prepare database', function(t) {
  var dropIndex = function() {
    var text = "DROP INDEX IF EXISTS citation_ids_gin_idx";
    return knex.raw(text);
  };

  var createIndex = function() {
    var text = "CREATE INDEX citation_ids_gin_idx ON cases USING GIN (json_val_arr(citations, 'id'))";
    return knex.raw(text);
  };

  knex('cases')
    .insert([knownCase, knownPayableCase])
    .then(dropIndex)
    .then(createIndex)
    .then(function() {
      t.end();
    });
});

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

test('Clean up the database', function(t) {
  knex('cases').where('id', knownCase.id).orWhere('id', knownPayableCase.id).del().then(function() {
    db.close();
    t.end();
  });
})