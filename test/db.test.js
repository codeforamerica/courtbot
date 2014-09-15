var test = require('tape');
var db = require('../lib/db');

// TODO: load in sample data and point to a test database

test('Can find an existing case by citation', function(t) {
  t.plan(4);

  var knownCase = {
    date: new Date('Wed Aug 27 2014 17: 00: 00 GMT - 0700(PDT)'),
    defendant: 'CATES, LAYLA ADRIANE',
    id: '000766abed3260573dea250eb5510d9d3b463430',
    room: '5A',
    time: '08:00:00 AM'
  };

  db.getCase('4763337', function(err, caseDetails) {
    t.equal(caseDetails.id, knownCase.id, 'Case has the expected id.');
    t.equal(caseDetails.defendant, knownCase.defendant, 'Case has the expected defendant.');
    t.equal(caseDetails.room, knownCase.room, 'Case has the expected room.');
    t.equal(caseDetails.time, knownCase.time, 'Case has the expected time.');
  });
});

test('If no case found, throws an error', function(t) {
  t.plan(1);

  db.getCase('not-a-real-key', function(err) {
    t.ok(err, 'Throws an error with an incorrect citation id.');
  });
});

test('Can search by first or last name', function(t) {
  t.plan(1);

  db.findCase('sam', function(err, cases) {
    t.equal(cases.length, 10, 'Found more than ten results with Sam.');
  });
});

test('Queued items can be added, retrieved, and resolved', function(t) {
  t.plan(3);

  var queuedItem = { citation_id: 'testcitationid', phone: '4154329889' };

  db.getAllQueued(function(err, queued) {
    t.equal(queued.length, 0, 'Queued table starts empty.');
    checkAddItem();
  });

  function checkAddItem() {
    db.addQueued(queuedItem, function() {
      db.getAllQueued(function(err, queued) {
        t.equal(queued.length, 1, 'Adding an item to the queued list increases the count by one.');
        var item = queued[0];
        checkResolveItem(item.queued_id);
      });
    });
  }

  function checkResolveItem(id) {
    db.resolveQueued(id, function() {
      db.getAllQueued(function(err, queued) {
        t.equal(queued.length, 0, 'Resolving the queued item lowers the count back to zero.');
      });
    });
  }
});

// test('Reminders can be added, retrieved, and resolved', function(t) {
//   t.plan(3);

//   // Add a reminder for a case we know is happening 'tomorrow'....
//   // how can this possibly work? tomorrow always changes.
//   // i guess we could add something specific to make data for tomorrow appear
//   var reminder = {
//     citation_id: 'testcitationid',
//     phone: '4154329889',
//     date: 'tomorrow somehow',
//   };

//   db.getTomorrowsReminders(function(err, reminders) {
//     t.equal(reminders.length, 0, 'Reminders table starts empty.');
//     checkAddItem();
//   });

//   function checkAddItem() {
//     db.addReminder(reminder, function() {
//       db.getTomorrowsReminders(function(err, reminders) {
//         t.equal(reminders.length, 1, 'Adding a reminder increases the count by one.');
//         var item = reminders[0];
//         checkResolveItem(item.reminder_id);
//       });
//     });
//   }

//   function checkResolveItem(id) {
//     db.resolveReminder(id, function() {
//       db.getTomorrowsReminders(function(err, reminders) {
//         t.equal(reminders.length, 0, 'Resolving the reminder lowers the count back to zero.');
//       });
//     });
//   }
// });

test('Can close the database', function(t) {
  db.close();
  t.end();
});
