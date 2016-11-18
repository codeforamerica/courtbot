require('dotenv').config();
var findReminders = require("../sendReminders.js").findReminders;
var expect = require("chai").expect;
var manager = require("../utils/db/manager");
var Promise = require("bluebird");

var db = require('../db');
var knex = manager.knex();

var dates = require("../utils/dates"),
    TEST_CASE_ID = "677167760f89d6f6ddf7ed19ccb63c15486a0eab",
    TEST_HOURS = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23],
    TEST_UTC_DATE = "2015-03-27T08:00:00-08:00";

describe("for a given date", function() {
    beforeEach(function(done) {
        manager.ensureTablesExist()
            .then(clearTable("cases"))
            .then(clearTable("reminders"))
            .then(loadCases([turnerData()]))
            .then(addTestReminder)
            .then(function(){
                done();
            });   
    });


    it("datetime in table matches datetime on the client", function(done) {

        knex.select("*").from("cases").where("date", TEST_UTC_DATE)
            .then(function(results) {
                expect(results.length).to.equal(1);
                done();
            });
    });

    it("datetime matches for all hours in a day", function(done) {
        var test = function(hr) {
            return new Promise(function(resolve, reject) {
                var testDateTime = dates.now().add(1, "days").hour(hr);
                updateCaseDate(TEST_CASE_ID, testDateTime)
                    .then(findReminders)
                    .then(function(results) {
                        console.log("TESTING HOUR: " + hr);
                        //console.log(JSON.stringify(results[0]));
                        //console.log(results[0].time, testDateTime.toString());
                        console.log(dates.fromUtc(results[0].date).format(), testDateTime.format());
                        expect(results.length).to.equal(1);
                        expect(dates.fromUtc(results[0].date).format()).to.equal(testDateTime.format());
                        expect(results[0].time).to.equal(dates.toFormattedTime(testDateTime))
                        resolve();
                    });     
            });
        };

        Promise.resolve(TEST_HOURS)
            .each(test)
            .then(function() {done();})
            .catch(done);
    });
});

function updateCaseDate(caseId, newDate) {
    return new Promise(function(resolve, reject) {
        //console.log("Updating date to: " + newDate.format());
        knex("cases")
            .where("id", "=", caseId)
            .update({
                "date": newDate.format(),
                "time": dates.toFormattedTime(newDate)
            })
            .then(resolve)
    });
};

function loadCases(cases) {
    return function() {
        return new Promise(function(resolve, reject) {
            //console.log("Adding test case.");
            knex("cases").insert(cases).then(resolve, reject);
        });
    };
};

function addTestReminder() {
    return new Promise(function(resolve, reject) {
       //console.log("Adding Test Reminder");
        db.addReminder({
            caseId: TEST_CASE_ID,
            phone: "+12223334444",
            originalCase: turnerData()
        }, function(err, data) {
            if(err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

function clearTable(table) {
    return function() {
        return new Promise(function(resolve, reject) {
            //console.log("Clearing table: " + table);
            knex(table).del().then(resolve, reject);
        });
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