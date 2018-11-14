require('dotenv').config(); // needed for local dev when not using Heroku to pull in env vars
const runnerScript = require('../utils/loaddata.js');
const manager = require('../utils/db/manager')
const runner_log = require('../utils/logger/runner_log')
const log = require('../utils/logger')
const {HTTPError} = require('../utils/errors')
const {addTestCase} = require('../utils/testCase')

let count = 0
const max_tries = 6
const time_between_retries = 5 * 60 * 1000

function load(){
    count++
    runnerScript()
    .then((r) => runner_log.loaded(r))
    .then(() => addTestCase())
    .then(() => manager.knex.destroy())
    .catch((err) => {
        if (count < max_tries && err instanceof HTTPError){
            console.log(err.message)
            log.debug("load failed retrying", err)
            setTimeout(load, time_between_retries) 
        } else {
            manager.knex.destroy()
            log.error(err)    
        }
    });    
}

load()