'use strict';
require('dotenv').config();
const sr = require("../sendReminders.js");
const sendReminders = sr.sendReminders;
const findReminders = sr.findReminders;
const expect = require("chai").expect;
const sinon = require('sinon')
const manager = require("../utils/db/manager");
const db = require('../db');
const knex = manager.knex;
const messages = require('../utils/messages')
const moment = require('moment-timezone')
const TEST_CASE_ID = "677167760f89d6f6ddf7ed19ccb63c15486a0eab",
      TOMORROW_DATE = moment(14, 'HH').tz(process.env.TZ).add(1, 'days'), // 2:00pm tomorrow
      TEST_UTC_DATE = moment("2015-03-27T08:00:00").tz(process.env.TZ).format();
// todo test that reminders are not sent when notification indicates its already sent

describe("with one reminder that hasn't been sent", function() {
    let messageStub

    beforeEach(function () {
       messageStub = sinon.stub(messages, 'send')
       messageStub.resolves(true)

       return manager.ensureTablesExist()
            .then(clearTable("hearings"))
            .then(clearTable("requests"))
            .then(clearTable("notifications"))
            .then(loadHearings([case1]))
            .then(addTestRequests([request1]))
    });

    afterEach(function() {
        messageStub.restore()
    });

    it("sends the correct info to Twilio and adds a notification", function() {
        var message = `Courtesy reminder: Frederick T Turner has a court hearing on ${TOMORROW_DATE.format('ddd, MMM Do')} at 2:00 PM, at CNVCRT. You should confirm your hearing date and time by going to ${process.env.COURT_PUBLIC_URL}. - ${process.env.COURT_NAME}`;
        return sendReminders()
        .then(rows => {
            sinon.assert.calledWith(messageStub, request1.phone, process.env.TWILIO_PHONE_NUMBER, message)
        });
    });

    it("sending reminder adds a notification with the correct case, phone, and time", function(){
        return sendReminders()
        .then(() => knex("notifications").where({ case_id: case1.case_id }).select("*"))
        .then(function (rows) {
            expect(rows.length).to.equal(1);
            expect(rows[0].phone).to.equal(db.encryptPhone(request1.phone))
            expect(moment(rows[0].event_date).tz(process.env.TZ).toISOString()).to.equal(moment(14, 'HH').tz(process.env.TZ).add(1, 'days').toISOString())
        })
    })
});

describe("when there is an error sending the message", function(){
    let messageStub
    const errorString = "an error occured"
    beforeEach(function () {
        messageStub = sinon.stub(messages, 'send')

        messageStub.rejects(new Error(errorString))

        return manager.ensureTablesExist()
            .then(clearTable("hearings"))
            .then(clearTable("requests"))
            .then(clearTable("notifications"))
            .then(loadHearings([case1]))
            .then(addTestRequests([request1]))
    });

    afterEach(function() {
        messageStub.restore()
    });

    it("records the error in the notification", function(){
        var message = `Courtesy reminder: Frederick T Turner has a court hearing on ${TOMORROW_DATE.format('ddd, MMM Do')} at 2:00 PM, at CNVCRT. You should confirm your hearing date and time by going to ${process.env.COURT_PUBLIC_URL}. - ${process.env.COURT_NAME}`;
        return sendReminders()
        .then(res => knex("notifications").whereIn('case_id', [case1['case_id'], case2['case_id']]).select("*"))
        .then(rows => {
            expect(rows[0].error).to.equal(errorString)
        });
    })

})

describe("with three reminders (including one duplicate) that haven't been sent", function () {
    let messageMock

    beforeEach(function () {
        messageMock = sinon.mock(messages)

        return manager.ensureTablesExist()
            .then(clearTable("hearings"))
            .then(clearTable("requests"))
            .then(clearTable("notifications"))
            .then(loadHearings([case1, case2]))
            .then(addTestRequests([request1, request2, request2_dup]))
    });

    afterEach(function() {
        messageMock.restore()
    });

    it("sends the correct info to Twilio, adds notification, and skips duplicate request", function () {
        var message1 = `Courtesy reminder: Frederick T Turner has a court hearing on ${TOMORROW_DATE.format('ddd, MMM Do')} at 2:00 PM, at CNVCRT. You should confirm your hearing date and time by going to ${process.env.COURT_PUBLIC_URL}. - ${process.env.COURT_NAME}`;
        var message2 = `Courtesy reminder: Bob J Smith has a court hearing on ${TOMORROW_DATE.format('ddd, MMM Do')} at 2:00 PM, at CNVJAIL. You should confirm your hearing date and time by going to ${process.env.COURT_PUBLIC_URL}. - ${process.env.COURT_NAME}`;

        messageMock.expects('send').resolves(true).once().withExactArgs(request1.phone, process.env.TWILIO_PHONE_NUMBER, message1)
        messageMock.expects('send').resolves(true).once().withExactArgs(request2.phone, process.env.TWILIO_PHONE_NUMBER, message2)

        return sendReminders()
        .then(res => knex("notifications").whereIn('case_id', [case1['case_id'], case2['case_id']]).select("*"))
        .then(rows => {
            messageMock.verify()
            expect(rows.length).to.equal(2);
        });
    });
});

describe("with notification already sent for hearing", function () {
    let messageMock

    beforeEach(function () {
        messageMock = sinon.mock(messages)

        return manager.ensureTablesExist()
            .then(clearTable("hearings"))
            .then(clearTable("requests"))
            .then(clearTable("notifications"))
            .then(loadHearings([case1, case2]))
            .then(addTestRequests([request1, request2]))
            .then(addTestNotification(notification1))
    });

    afterEach(function() {
        messageMock.restore()
    });

    it("Should only send reminders to requests without existing notifications for same case_id/event time/number", function(){
        var message = `Courtesy reminder: Bob J Smith has a court hearing on ${TOMORROW_DATE.format('ddd, MMM Do')} at 2:00 PM, at CNVJAIL. You should confirm your hearing date and time by going to ${process.env.COURT_PUBLIC_URL}. - ${process.env.COURT_NAME}`;
        messageMock.expects('send').resolves(true).once().withExactArgs(request2.phone, process.env.TWILIO_PHONE_NUMBER, message)

        return knex("notifications").update({ event_date: TOMORROW_DATE})
        .then(() => sendReminders())
        .then(() => knex("notifications").whereIn('case_id', [case1['case_id'], case2['case_id']]).select("*"))
        .then(rows => {
            messageMock.verify()
            expect(rows.length).to.equal(2)
        })
    })

    it("should send reminder when notification exists for same phone/case_id but at a different date/time", function(){
        var message1 = `Courtesy reminder: Frederick T Turner has a court hearing on ${TOMORROW_DATE.format('ddd, MMM Do')} at 2:00 PM, at CNVCRT. You should confirm your hearing date and time by going to ${process.env.COURT_PUBLIC_URL}. - ${process.env.COURT_NAME}`;
        var message2 = `Courtesy reminder: Bob J Smith has a court hearing on ${TOMORROW_DATE.format('ddd, MMM Do')} at 2:00 PM, at CNVJAIL. You should confirm your hearing date and time by going to ${process.env.COURT_PUBLIC_URL}. - ${process.env.COURT_NAME}`;

        messageMock.expects('send').resolves(true).once().withExactArgs(request1.phone, process.env.TWILIO_PHONE_NUMBER, message1)
        messageMock.expects('send').resolves(true).once().withExactArgs(request2.phone, process.env.TWILIO_PHONE_NUMBER, message2)
        
        return sendReminders()
        .then(() => messageMock.verify())
    })
})

function loadHearings(hearing) {
    return function() {
        return knex("hearings").insert(hearing);
    }
}

function addTestRequests(requests) {
    return function () {
        return Promise.all(requests.map(function (request) {
            return addTestRequest(request);
        }));
    }
}

function addTestRequest(request) {
    return db.addRequest({
        case_id: request.case_id,
        phone: request.phone,
        known_case: request.known_case
    });
}
function addTestNotification(notification){
    return function(){
        return knex("notifications").insert(notification)
    }
}
function clearTable(table) {
    return function() {
        return knex(table).del()
    };
}

const case1 = {
    //date: '27-MAR-15',
    date: TOMORROW_DATE,
    defendant: 'FREDERICK T TURNER',
    room: 'CNVCRT',
    case_id: "4928456"
}

const case2 = {
    //date: '27-MAR-15',
    date: TOMORROW_DATE,
    defendant: ' Bob J SMITH',
    room: 'CNVJAIL',
    case_id: "4928457"
}

const request1 = {
    phone: "+12223334444",
    case_id: case1.case_id,
    known_case: true
}

const request2 = {
    case_id: case2.case_id,
    phone: "+12223334445",
    known_case: true
}

const request2_dup = {
    case_id: case2.case_id,
    phone: "+12223334445",
    known_case: true
}

const notification1 = {
    case_id: case1.case_id,
    phone: db.encryptPhone(request1.phone),
    event_date: TEST_UTC_DATE,
    type:'reminder'
}

