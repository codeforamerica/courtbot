// Special env vars needed for NOCK consistency

process.env.TWILIO_ACCOUNT_SID = "test";
process.env.TWILIO_AUTH_TOKEN = "token";
process.env.TWILIO_PHONE_NUMBER = "+test";

require('dotenv').config();
var sendReminders = require("../sendReminders.js");
var expect = require("chai").expect;
var assert = require("chai").assert;
var nock = require('nock');
var moment = require("moment");

var db = require('../db');
var Knex = require('knex');
var knex = Knex.initialize({
    client: 'pg',
    connection: process.env.DATABASE_URL
});


nock.disableNetConnect();
nock('https://api.twilio.com:443').log(console.log);

describe("with a reminder that hasn't been sent", function() {
    beforeEach(function(done) {
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
    });

    it("sends the correct info to Twilio and updates the reminder to sent", function(done) {
        var number = "+12223334444";
        var message = "Reminder: You've got a court case tomorrow at 01:00:00 PM in court room CNVCRT." +
            " Call us at (907) XXX-XXXX with any questions. - Alaska State Court System";


        knex("cases").update({date: moment().add(1, 'days')}).then(function() {
            nock('https://api.twilio.com:443')
                .post('/2010-04-01/Accounts/test/Messages.json', "To=" + encodeURIComponent(number) + "&From=%2Btest&Body=" + encodeURIComponent(message))
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
    return { date: '27-MAR-15',
        defendant: 'TURNER, FREDERICK T',
        room: 'CNVCRT',
        time: '01:00:00 PM',
        citations: '[{"id":"4928456","violation":"40-8-76.1","description":"SAFETY BELT VIOLATION","location":"27 DECAATUR ST"}]',
        id: '677167760f89d6f6ddf7ed19ccb63c15486a0eab' + (v||"")
    };
}
