var runnerScript = require("../sendReminders.js").sendReminders;

runnerScript().then(function(success) {
  console.log("Success: ",success);
  process.exit(0);
}, function(err) {
  console.log("Error: ",err);
  process.exit(1);
});
