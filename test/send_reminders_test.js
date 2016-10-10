// Special env vars needed for NOCK consistency

process.env.TWILIO_ACCOUNT_SID = "test";
process.env.TWILIO_AUTH_TOKEN = "token";
process.env.TWILIO_PHONE_NUMBER = "+test";

require('dotenv').config();
var sendReminders = require("../sendReminders.js");
var expect = require("chai").expect;
var nock = require('nock');
var moment = require("moment");
var manager = require("../utils/db/manager");

var db = require('../db');
var knex = require('knex')({
    client: 'pg',
    connection: process.env.DATABASE_URL
});


nock.disableNetConnect();
nock('https://api.twilio.com:443').log(console.log);

describe("with a reminder that hasn't been sent", function() {
    beforeEach(function(done) {
        function initData() {
            knex('cases').del()
                .then(function() {
                    return knex('cases').insert([turnerData()])
                })
                .then(function() {
                    return knex('reminders').del()
                })
                .then(function() {
                    return db.addReminder({
                        caseId: "677167760f89d6f6ddf7ed19ccb63c15486a0eab",
                        phone: "+12223334444",
                        originalCase: turnerData()
                    }, function(err, data) {
                        done(err);
                    });
                });
        };

        manager.ensureTablesExist().then(initData);       
    });

    it("sends the correct info to Twilio and updates the reminder to sent", function(done) {
        var number = "+12223334444";
        var message1 = "(1/2) Reminder: It appears you have a court case tomorrow at 2:00 PM at NEWROOM.";
        var message2 = "(2/2) You should confirm your case date and time by going to " + process.env.COURT_PUBLIC_URL + ". - Alaska State Court System";

        knex("cases").update({date: moment().add(1, 'days'), time: '02:00:00 PM', room: 'NEWROOM' })
            .then(function() {
                nock('https://api.twilio.com:443')
                    .post('/2010-04-01/Accounts/test/Messages.json', "To=" + encodeURIComponent(number) + "&From=%2Btest&Body=" + encodeURIComponent(message1))
                    .reply(200, {"status":200}, { 'access-control-allow-credentials': 'true'});
                nock('https://api.twilio.com:443')
                    .post('/2010-04-01/Accounts/test/Messages.json', "To=" + encodeURIComponent(number) + "&From=%2Btest&Body=" + encodeURIComponent(message2))
                    .reply(200, {"status":200}, { 'access-control-allow-credentials': 'true'});
            sendReminders().then(function(res) {
                knex("reminders").select("*").then(function(rows) {
                    expect(rows[0].sent).to.equal(true);
                    done();
                }).catch(done);
            });
        }, done);
    });
});

function turnerData(v) {
    return { 
        //date: '27-MAR-15',
        date: '2015-03-27T08:00:00.000Z',        
        defendant: 'TURNER, FREDERICK T',
        room: 'CNVCRT',
        time: '01:00:00 PM',
        citations: '[{"id":"4928456","violation":"40-8-76.1","description":"SAFETY BELT VIOLATION","location":"27 DECAATUR ST"}]',
        id: '677167760f89d6f6ddf7ed19ccb63c15486a0eab' + (v||"")
    };
}
