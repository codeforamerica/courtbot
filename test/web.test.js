var test = require('tape');
var db = require('../lib/db');
var web = require('../routes/web');

test('Web API can lookup cases by string', function(t) {
  t.plan(4);

  var knownCase = {
    date: new Date('Wed Aug 27 2014 17: 00: 00 GMT - 0700(PDT)'),
    defendant: 'CATES, LAYLA ADRIANE',
    id: '000766abed3260573dea250eb5510d9d3b463430',
    room: '5A',
    time: '08:00:00 AM'
  };

  var req = {
    query: { q: '4763337' },
  };
  var res = {
    send: function(body) {
      var caseDetails = body[0];
      t.equal(caseDetails.id, knownCase.id, 'Case has the expected id.');
      t.equal(caseDetails.defendant, knownCase.defendant, 'Case has the expected defendant.');
      t.equal(caseDetails.room, knownCase.room, 'Case has the expected room.');
      t.equal(caseDetails.time, knownCase.time, 'Case has the expected time.');
    }
  };

  web(req, res);
});

test('Closing the database', function(t) {
  db.close();
  t.end();
});
