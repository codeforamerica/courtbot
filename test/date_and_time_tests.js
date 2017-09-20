require('dotenv').config();
var findReminders = require("../sendReminders.js").findReminders;
var expect = require("chai").expect;
var manager = require("../utils/db/manager");

var db = require('../db');
var knex = manager.knex;

var dates = require("../utils/dates"),
    TEST_CASE_ID = "677167760f89d6f6ddf7ed19ccb63c15486a0eab",
    TEST_HOURS = [-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,23.75,24,24.15,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49],
    TEST_UTC_DATE = "2015-03-27T08:00:00" + dates.timezoneOffset("2015-03-27");

describe("for a given date", function() {
    beforeEach(function() {
        return manager.ensureTablesExist()
            .then(clearTable("cases"))
            .then(clearTable("reminders"))
            .then(loadCases([turnerData()]))
            .then(addTestReminder)
    });


    it("datetime in table matches datetime on the client", function() {

        return knex.select("*").from("cases").where("date", TEST_UTC_DATE)
            .then(function(results) {
                expect(results.length).to.equal(1);
            });
    });

    it("datetime matches for all hours in a day", function() {
        this.timeout(5000); // This may take a while
        let test = function(hr) {
                console.log("hr: ", hr)
                let testDateTime = dates.now().add(1, "days").hour(0).add(hr, "hours");
                console.log("Now: ",dates.now().format());
                return updateCaseDate(TEST_CASE_ID, testDateTime)
                    .then(findReminders)
                    .then(function(results) {
                        if (results[0]) console.log(dates.fromUtc(results[0].date).format(), testDateTime.format());
                        if ((hr >= 0) && (hr < 24)) {  // Should only find reminders for the next day
                            console.log("Reminder found for hour ", hr)
                            expect(results.length).to.equal(1);
                            expect(dates.fromUtc(results[0].date).format()).to.equal(testDateTime.format());
                            expect(results[0].time).to.equal(dates.toFormattedTime(testDateTime));
                        } else {
                            console.log("NO reminder found for hour ", hr)
                            expect(results.length).to.equal(0);
                        }
                    });
        };

        // test() overwrites DB data with each iteration so it's important that the tests are done sequentially
        return TEST_HOURS.reduce((p, hr) =>{
            return p.then(r=> test(hr))
        }, Promise.resolve())

    });
});

function updateCaseDate(caseId, newDate) {
    console.log("Updating date to: " + newDate.format());
    return  knex("cases")
            .where("id", "=", caseId)
            .update({
                "date": newDate.format(),
                "time": dates.toFormattedTime(newDate)
            })
            .then(() => knex('cases')
                .where("id", "=", caseId)
                .select()
                .then(function(results) {
                    console.log("Stored: ", results[0].date, " ",results[0].time)
                    return results
                })
            )
}

function loadCases(cases) {
    return function() {
        //console.log("Adding test case.");
        return knex("cases").insert(cases);
    };
};

function addTestReminder() {
       //console.log("Adding Test Reminder");
       return  db.addReminder({
            caseId: TEST_CASE_ID,
            phone: "+12223334444",
            originalCase: turnerData()
        })
};

function clearTable(table) {
    return function() {
        //console.log("Clearing table: " + table);
         return  knex(table).del()
    };
};

function turnerData(v) {
    return {
        //date: '27-MAR-15',
        date: TEST_UTC_DATE,
        defendant: 'TURNER, FREDERICK T',
        room: 'CNVCRT',
        time: '01:00:00 PM',
        citations: '[{"id":"4928456","violation":"40-8-76.1","description":"SAFETY BELT VIOLATION","location":"27 DECAATUR ST"}]',
        id: TEST_CASE_ID + (v||"")
    };
};
