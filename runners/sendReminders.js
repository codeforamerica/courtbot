/* eslint "no-console": "off" */

require('dotenv').config(); // needed for local dev when not using Heroku to pull in env vars
const runnerScript = require('../sendReminders.js').sendReminders;
const manager = require('../utils/db/manager')
const runner_log = require('../utils/logger/runner_log')
const log = require('../utils/logger')

runnerScript()
.then(reminders => runner_log.sent({action: 'send_reminder', data: reminders}))
.then(() => manager.knex.destroy())
.catch((err) => {
    manager.knex.destroy()
    log.error(err)
});
