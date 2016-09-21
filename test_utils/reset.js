var exec = require('child_process').exec;

console.log("Reseting courtbot_test");

exec("dropdb --if-exists 'courtbot_test'", function(err, std) {
  if (err) {
    console.error(err);
  } else {
    exec("createdb 'courtbot_test'", function (err, std) {
      if (err) {
        console.error(err);
      } else {
        exec("DATABASE_URL=postgres://localhost:5432/courtbot_test node utils/createQueuedTable.js", function (err, std) {
          if (err) {
            console.error(err);
          } else {
            exec("DATABASE_URL=postgres://localhost:5432/courtbot_test node utils/createRemindersTable.js", function (err, std) {
              if (err) {
                console.error(err);
              } else {
                console.log("Finished");
              }
            });
          }
        });
      }
    });
  }
});
