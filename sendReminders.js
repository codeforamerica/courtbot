/* eslint "no-console": "off" */

const db = require('./db.js');
const manager = require('./utils/db/manager');
const messages = require('./utils/messages');
const knex = manager.knex;
const logger = require('./utils/logger');

/**
 * Find all reminders with a case date of tomorrow for which a reminder has not been sent for that date/time
 *
 * @return {array} Promise to return results
 */
function findReminders() {
    return knex.raw(`
        SELECT DISTINCT case_id, phone, defendant, date, room FROM requests
        INNER JOIN hearings USING (case_id)
        WHERE tstzrange(TIMESTAMP 'tomorrow', TIMESTAMP 'tomorrow' + interval '1 day') @> hearings.date
        AND requests.active = true
        AND hearings.case_id NOT IN
        (SELECT case_id FROM notifications WHERE notifications.type = 'reminder' AND notifications.event_date = hearings.date )
    `)
    .then(result => result.rows)
}

/**
 * Update statuses of reminders that we send messages for.
 *
 * @param  {Object} reminder reminder record that needs to be updated in db.
 * @return {Promise} Promise that resolves to the reminder.
 */
function sendReminder(reminder) {
    const phone = db.decryptPhone(reminder.phone);
    return messages.send(phone, process.env.TWILIO_PHONE_NUMBER, messages.reminder(reminder))
    .then(() => {
        return knex('notifications')
        .insert({
            case_id: reminder.case_id,
            phone:reminder.phone,
            event_date: reminder.date,
            type: 'reminder'
        })
        .then(() => reminder) // knex needsa then() to fire the request
    })
    .catch(err => {
        return knex('notifications')
        .insert({
            case_id: reminder.case_id,
            phone:reminder.phone,
            event_date: reminder.date,
            type: 'reminder',
            error: err.message
        })
        .then(() =>{
            logger.error(err)
            reminder.error = err
            return reminder
        })
    })
}

/**
 * Main function for executing:
 *   1.)  The retrieval of court date reminders
 *   2.)  Add notification and Send Status
 *
 * @return {Promise} Promise to send messages and update statuses.
 */
function sendReminders() {
    return findReminders()
    .then(resultArray => Promise.all(resultArray.map(r => sendReminder(r))))
}

module.exports = {
    findReminders,
    sendReminders,
};
