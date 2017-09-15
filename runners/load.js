/* eslint "no-console": "off" */

require('dotenv').config(); // needed for local dev when not using Heroku to pull in env vars
const runnerScript = require('../utils/loaddata.js');
const rollbar = require('rollbar');

rollbar.init(process.env.ROLLBAR_ACCESS_TOKEN);

runnerScript()
  .then((success) => {
    console.log('Success: ', success);
    process.exit(0);
  })
  .catch((err) => {
    console.log('Error: ', err);
    // Using callback for process.exit() so the process does not exit before rollbar
    //    is finished sending error.
    //    Sending null as second arg since there is no
    //    request object
    rollbar.handleError(err, null, () => {
      process.exit(1);
    });
  });
