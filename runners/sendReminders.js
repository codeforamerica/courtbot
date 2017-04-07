require('dotenv').config();  // needed for local dev when not using Heroku to pull in env vars
var runnerScript = require("../sendReminders.js").sendReminders;
var rollbar = require("rollbar");
rollbar.init(process.env.ROLLBAR_ACCESS_TOKEN);

runnerScript().then(function(success) {
  console.log("Success: ",success);
  process.exit(0);
}, function(err) {
  console.log("Error: ",err);
  // Using callback for process.exit() so the process does not exit before rollbar
  //    is finished sending error.
  //    Sending null as second arg since there is no
  //    request object
  rollbar.handleError(err, null, function() {
      process.exit(1);
  });
});
