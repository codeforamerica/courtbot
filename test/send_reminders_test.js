// Special env vars needed for NOCK consistency
process.env.TWILIO_ACCOUNT_SID = "test";
process.env.TWILIO_AUTH_TOKEN = "token";
process.env.TWILIO_PHONE_NUMBER = "+test";
require('dotenv').config();
var sr = require("../sendReminders.js");
var sendReminders = sr.sendReminders;
var findReminders = sr.findReminders;
var expect = require("chai").expect;
var nock = require('nock');
var manager = require("../utils/db/manager");
var Promise = require("bluebird");
var db = require('../db');
var knex = manager.knex();

var dates = require("../utils/dates"),
    TEST_CASE_ID = "677167760f89d6f6ddf7ed19ccb63c15486a0eab",
    TEST_UTC_DATE = "2015-03-27T08:00:00" + dates.timezoneOffset("2015-03-27");

nock.disableNetConnect();
nock('https://api.twilio.com:443').log(console.log);

describe("with a reminder that hasn't been sent", function () {
    beforeEach(function (done) {
        manager.ensureTablesExist()
            .then(clearTable("cases"))
            .then(clearTable("reminders"))
            .then(loadCases([case1, case2]))
            //.then(Promise.all(t))
            //.then(loadCases([smithData()]))
            //.then(addTestReminder)
            //.then(addTestReminder2(reminder1))
            .then(function () {
                return Promise.all([addTestReminder2(reminder1)])
            })
            //.then(addTestReminder2)
            .then(function () {
                done();
            });

        // reminderArray.forEach(function(item){
        //     console.log(item.originalCase.defendant);
        //     addTestReminder2(item);
        // });




    });

    it("sends the correct info to Twilio and updates the reminder to sent", function (done) {
        var number = "+12223334444";
        var message1 = "(1/2) Reminder: It appears you have a court case tomorrow at 2:00 PM at NEWROOM.";
        var message2 = "(2/2) You should confirm your case date and time by going to " + process.env.COURT_PUBLIC_URL + ". - Alaska State Court System";

        knex("cases").update({ date: dates.now().add(1, 'days'), time: '02:00:00 PM', room: 'NEWROOM' })
            .then(function () {
                nock('https://api.twilio.com:443')
                    .post('/2010-04-01/Accounts/test/Messages.json', "To=" + encodeURIComponent(number) + "&From=%2Btest&Body=" + encodeURIComponent(message1))
                    .reply(200, { "status": 200 }, { 'access-control-allow-credentials': 'true' });
                nock('https://api.twilio.com:443')
                    .post('/2010-04-01/Accounts/test/Messages.json', "To=" + encodeURIComponent(number) + "&From=%2Btest&Body=" + encodeURIComponent(message2))
                    .reply(200, { "status": 200 }, { 'access-control-allow-credentials': 'true' });

                sendReminders().then(function (res) {
                    knex("reminders").select("*").then(function (rows) {

                        console.log(JSON.stringify(rows));

                        expect(rows[0].sent).to.equal(true);
                        done();
                    }).catch(done);
                });

            }, function (err, data) {
                if (err) {
                    console.log("ERROR", err);
                    done();
                }
            });
    });

});

function loadCases(cases) {
    return function () {
        return new Promise(function (resolve, reject) {
            //console.log("Adding test case.");
            knex("cases").insert(cases).then(resolve, reject);
        });
    };
};

function addTestReminder() {
    return new Promise(function (resolve, reject) {
        //console.log("Adding Test Reminder");
        db.addReminder({
            caseId: TEST_CASE_ID,
            phone: "+12223334444",
            originalCase: case1
        }, function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

function addTestReminder2(reminder) {
    return function () {
        return new Promise(function (resolve, reject) {
            //console.log("Adding Test Reminder");
            db.addReminder({
                caseId: reminder.caseId,
                phone: reminder.phone,
                originalCase: reminder.originalCase
            }, function (err, data) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
};

function clearTable(table) {
    return function () {
        return new Promise(function (resolve, reject) {
            //console.log("Clearing table: " + table);
            knex(table).del().then(resolve, reject);
        });
    };
};

var case1 = {
    //date: '27-MAR-15',
    date: TEST_UTC_DATE,
    defendant: 'TURNER, FREDERICK T',
    room: 'CNVCRT',
    time: '01:00:00 PM',
    citations: '[{"id":"4928456","violation":"40-8-76.1","description":"SAFETY BELT VIOLATION","location":"27 DECAATUR ST"}]',
    id: "677167760f89d6f6ddf7ed19ccb63c15486a0eab"

};
var case2 = {
    //date: '27-MAR-15',
    date: TEST_UTC_DATE,
    defendant: 'SMITH, FREDERICK T',
    room: 'CNVJAIL',
    time: '01:00:00 PM',
    citations: '[{"id":"4928457","violation":"40-8-76.1","description":"DRIVING TO SLOW...","location":"22 NUNYA DR"}]',
    id: "677167760f89d6f6ddf7ed19ccb63c15486a0eac"
};

var reminder1 = {
    caseId: case1.id,
    phone: "+12223334444",
    originalCase: case1
}
var reminder2 = {
    caseId: case2.id,
    phone: "+12223334445",
    originalCase: case2
}

var a = new Promise(function (resolve, reject) {
    //console.log("Adding Test Reminder");
    db.addReminder({
        caseId: TEST_CASE_ID,
        phone: "+12223334444",
        originalCase: case1
    }, function (err, data) {
        if (err) {
            reject(err);
        } else {
            resolve();
        }
    });
});
var t = [a];
var reminderArray = [reminder1];
