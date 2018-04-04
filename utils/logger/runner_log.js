const {knex} = require("../db/manager");
const logger = require("./index")

/**
 * Creates an entry in the log_runners table and an entries for each request in the log_request_events table
 * @param {Object} loginfo
 * @param {string} loginfo.action - one of the enumerated actions available in log tables
 * @param {Object[]} loginfo.data - array of requests that have been notified, matched, or expired
 * @returns {Promise} resolves when DB is finished saving
 */
function logSendRunner({action, data}) {
    if (!action || !data) throw new Error("Cannot log without action and data")
    const {err, sent} = data.reduce((a, c) => (c.error ? a.err += 1 : a.sent += 1, a), {err: 0, sent: 0})
    return knex('log_runners').insert({ runner: action, count: sent, error_count: err })
    .then(() => ({action, err, sent}))
}

/**
 * Adds an entry to log_runners. Should be called when new csv files are loaded
 * @param {Object} param
 * @param {number} param.files - the number of files processed
 * @param {number} param.records - the number of hearings added
 */
function logLoadRunner({files, records}) {
    return knex('log_runners').insert({ runner: 'load', count: records })
    .then(() => ({files, records}))
}

const runnerLog = {
    sent({action, data}){
        return logSendRunner({action, data})
        .then((r) => logger.info(`Runner: ${r.action} | sent: ${r.sent} errors: ${r.err} `))
        .catch(logger.error)
    },
    loaded({files, records}){
        return logLoadRunner({files, records})
        .then((r) => logger.info(`Runner: load | files: ${r.files} records: ${r.records} `))
        .catch(logger.error)
    }
}
module.exports = runnerLog