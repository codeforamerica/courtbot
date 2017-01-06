var exec = require('child_process').exec;

console.log("Reseting courtbotdb");

exec("dropdb --if-exists 'courtbotdb'", function(err, std) {
  if (err) {
    console.error(err);
  } else {
    exec("createdb 'courtbotdb'", function (err, std) {
      if (err) {
        console.error(err);
      } else {
        exec("DATABASE_URL=postgres://localhost:5432/courtbotdb node utils/createQueuedTable.js", function (err, std) {
          if (err) {
            console.error(err);
          } else {
            exec("DATABASE_URL=postgres://localhost:5432/courtbotdb node utils/createRemindersTable.js", function (err, std) {
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
