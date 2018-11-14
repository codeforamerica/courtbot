const manager = require('./db/manager');
const knex = manager.knex;

/**
 * These functions manage a fake test case to allow to subscribe to a test case
 * Becuase the hearings table is deleted and refreshed every day some care is
 * required to ensure this case always has a hearing set for the next round of reminders.
 * 
 * If someone subscribes to the test case on Monday before reminders have been sent they should get a reminder Monday evening
 * for a case on Tuesday. If they sign up on Monday after the reminders have been sent or Tuesday before the reminders
 * the should get a reminder on Tuesday night for a case on Wednesday.
 * 
 * This means we have to add the test hearing when loading hearings 
 * AND need to adjust the date of the test hearing after reminders have been sent. 
 * 
 */

/**
 * Deletes requests for the test case number.
 * The test case has a hearing every day, but each request should just 
 * get one notification. This should run after notification have been sent
 */
function deleteTestRequests(){
    if (process.env.TEST_CASE_NUMBER) {
        return knex('requests').where('case_id', process.env.TEST_CASE_NUMBER)
        .del()
    }
}

/**
 * Sets the date of the test case hearing forward 1 day.
 * This should run right after sending reminders so future subsribers get the corrent date.
 */
function incrementTestCaseDate(){
    if (process.env.TEST_CASE_NUMBER) {
        return knex.raw(`
            UPDATE hearings 
            SET date = (date + interval '1 day')
            WHERE case_id = '${process.env.TEST_CASE_NUMBER}'
        `)
    }
}

/**
 * Adds a row to the hearing table for tommorrow for a test case
 * This nees to run after loaddata has refreshed the hearings table so
 *  that day's subsribers get the request,
 */
async function addTestCase(){
    /* This needs to add a test case for tomorrow's date
       So when the reminders are sent subscribers get the reminder */
    if (process.env.TEST_CASE_NUMBER){
        return  knex.raw(
            `INSERT INTO hearings (date, defendant, room, case_id)
             VALUES (CURRENT_DATE + interval '35 hours', 'John Doe', 'Courtroom B, Juneau Courthouse', '${process.env.TEST_CASE_NUMBER}')`
        )
    }
}

module.exports = {
    deleteTestRequests,
    incrementTestCaseDate,
    addTestCase
};
