'use strict';
require('dotenv').config();
const findReminders = require("../sendReminders.js").findReminders;
const expect = require("chai").expect;
const manager = require("../utils/db/manager");
const db = require('../db');
const knex = manager.knex;
const moment = require("moment-timezone");
const TEST_CASE_ID = "1MM-17-00029CR",
      TEST_HOURS = [-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,23.75,24,24.15,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49],
      TEST_UTC_DATE = moment("2015-03-27T08:00:00").tz('America/Anchorage').format();

describe("With local dates without timezone", function() {
    beforeEach(function() {
        return manager.ensureTablesExist()
        .then(() => knex("hearings").del())
    });

    it("Database can read csv date format and gets correct time without timezone", function(){
        const test_date = moment('2014-09-08T10:00:00').tz(process.env.TZ)
        const date_string = "09/08/2014 10:00AM"
        return knex("hearings").insert([turnerData("", date_string)])
        .then(() => knex.select("*").from("hearings"))
        .then(row => expect(moment(row[0].date).toISOString()).to.equal(test_date.toISOString()))
    })
    it("Database assumes correct time zone when none is given during DST", function(){
        const test_date = moment('2014-11-08T10:00:00').tz(process.env.TZ)
        const date_string = "11/08/2014 10:00AM"
        return knex("hearings").insert([turnerData("", date_string)])
        .then(() => knex.select("*").from("hearings"))
        .then(row => {
            expect(moment(row[0].date).toISOString()).to.equal(test_date.toISOString())
        })
    })
})

describe("For a given date", function() {
    beforeEach(function() {
        return manager.ensureTablesExist()
        .then(() => knex("hearings").del())
        .then(() => knex("requests").del())
        .then(() => knex("hearings").insert([turnerData()]))
        .then(() => addTestRequest())
    });

    it("datetime in table matches datetime on the client", function() {
        return knex.select("*").from("hearings").where("date", TEST_UTC_DATE)
        .then(results =>  expect(results.length).to.equal(1));
    });

    it("datetime matches for all hours in a day", function() {
        this.timeout(5000); // This may take a while
        const test = function(hr) {
            console.log("hr: ", hr)
            const testDateTime = moment().add(1, "days").hour(0).minute(0).add(hr, "hours");
            console.log("Now: ", moment().format());

            return updateHearingDate(TEST_CASE_ID, testDateTime)
            .then(findReminders)
            .then(function(results) {
                if (results[0]) console.log(moment(results[0].date).format(), testDateTime.format());
                if ((hr >= 0) && (hr < 24)) {  // Should only find reminders for the next day
                    console.log("Reminder found for hour ", hr)
                    expect(results.length).to.equal(1);
                    expect(moment(results[0].date).format()).to.equal(testDateTime.format());
                } else {
                    console.log("NO reminder found for hour ", hr)
                    expect(results.length).to.equal(0);
                }
            });
        };

        // test() overwrites DB data with each iteration so it's important that the tests are done sequentially
        return TEST_HOURS.reduce((p, hr) => p.then(r => test(hr)), Promise.resolve())
    });
});

function updateHearingDate(caseId, newDate) {
    console.log("Updating date to: " + newDate.format());
    return  knex("hearings").where("case_id", "=", caseId)
    .update({
        "date": newDate.format(),
    })
    .then(() => knex('hearings').where("case_id", "=", caseId).select())
    .then(function(results) {
        console.log("Stored: ", results[0].date)
        return results
    });
}


function addTestRequest() {
    //console.log("Adding Test Reminder");
    return  db.addRequest({
        case_id: TEST_CASE_ID,
        phone: "+12223334444",
        known_case: true
    });
};


function turnerData(v, d) {
    return {
        //date: '27-MAR-15',
        date: d || TEST_UTC_DATE,
        defendant: 'TURNER, FREDERICK T',
        room: 'CNVCRT',
        case_id: TEST_CASE_ID + (v||"")
    };
};
