var runnerScript = require("../sendReminders.js").sendReminders;

runnerScript().then(function(success) {
  console.log(success);
  process.exit(0);
}, function(err) {
  console.log(err);
  process.exit(1);
});
