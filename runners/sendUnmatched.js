/* eslint "no-console": "off" */

require('dotenv').config(); // needed for local dev when not using Heroku to pull in env vars
const runnerScript = require('../sendUnmatched.js').sendUnmatched;
const manager = require('../utils/db/manager')
const runner_log = require('../utils/logger/runner_log')
const log = require('../utils/logger')

runnerScript()
.then((expired_and_matched) => {
    return Promise.all([
        runner_log.sent({action:'send_expired', data: expired_and_matched.expired}),
        runner_log.sent({action: 'send_matched', data: expired_and_matched.matched})
        ])
})
.then(() => manager.knex.destroy())
.catch((err) => {
    manager.knex.destroy()
    log.error(err)
});
