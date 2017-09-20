'use strict';
// setup ENV dependencies
require('dotenv').config();

const fs = require('fs');
const expect = require('chai').expect;
const nock = require('nock');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const tk = require('timekeeper');
const Session = require('supertest-session')({
  app: require('../web')
});

const db = require('../db.js');
const manager = require('../utils/db/manager');
const dates = require('../utils/dates');
const moment = require('moment-timezone');

const knex = manager.knex;

const TEST_UTC_DATE = "2015-03-27T13:00:00" + dates.timezoneOffset("2015-03-27");

var sess;

beforeEach(function () {
  sess = new Session();
  var time = new Date("2015-03-02T12:00:00" + dates.timezoneOffset("2015-03-02")); // Freeze
  tk.freeze(time);
});

afterEach(function () {
  sess.destroy();
  tk.reset();
});

nock.enableNetConnect('127.0.0.1');

/**
 * Altered this to do a local read of the expected content to get expected content length because
 * on windows machine the content length was 354 and not the hard-coded 341 (maybe windows character encoding?)
 *
 * It is partly a guess that it is okay to make this change because I am assuming the unit tests
 * only should run where app.settings.env == 'development' (web.js) -- this is what causes public/index.html
 * to be served, rather than "hello I am courtbot..."
 */
describe("GET /", function() {
    it("responds with web form test input", function(done) {
        var expectedContent = fs.readFileSync("public/index.html", "utf8");
        sess.get('/')
        .expect('Content-Length', expectedContent.length)
        .expect(200)
        .end(function(err, res) {
            if (err) return done(err);
            expect(res.text).to.contain("Impersonate Twilio");
            done();
        });
    });
});

describe("GET /cases", function() {
    it("400s when there is no ?q=", function(done) {
        sess.get('/cases')
        .expect(400, done);
    });

    it("200s + empty array when there is ?q=", function(done) {
        sess.get('/cases?q=test')
        .expect(200)
        .end(function(err, res) {
            if (err) return done(err);
            expect(res.text).to.equal("[]");
            done();
        });
    });

    it("finds partial matches of name", function(done) {
        knex('cases').del().then(function() {
        knex('cases').insert([turnerData(1), turnerData(2)]).then(function() {
            sess.get('/cases?q=turner')
            .expect(200)
            .end(function(err, res) {
            if (err) return done(err);
            expect([sortObject(JSON.parse(res.text)[0]),sortObject(JSON.parse(res.text)[1])]).to.deep.equal([turnerDataAsObject(1), turnerDataAsObject(2)]);
            done();
            });
        });
        });
    });

    it("finds exact matches of id", function(done) {
        knex('cases').del()
        .then(() => knex('cases').insert([turnerData()]))
        .then(() => {
            sess.get('/cases?q=4928456')
            .expect(200)
            .end(function(err, res) {
                if (err) return done(err);
                expect(sortObject(JSON.parse(res.text))["0"]).to.deep.equal(turnerDataAsObject());
                done();
            });
        });
    });

    it("finds find id with leading and trailing spaces", function(done) {
        knex('cases').del()
        .then(() =>  knex('cases').insert([turnerData()]))
        .then(() => {
            sess.get('/cases?q=%204928456%20')
            .expect(200)
            .end(function(err, res) {
                if (err) return done(err);
                expect(sortObject(JSON.parse(res.text))["0"]).to.deep.equal(turnerDataAsObject());
                done();
            });
        });
    });

    it("doesnt find partial matches of id", function(done) {
        knex('cases').del()
        .then(() => knex('cases').insert([turnerData()]))
        .then(() => {
            sess.get('/cases?q=492845')
            .expect(200)
            .end(function(err, res) {
                if (err) return done(err);
                expect(JSON.parse(res.text)).to.deep.equal([]);
                done();
            });
        });
    });
});

describe("POST /sms", function() {
    beforeEach(function(done) {
      knex('cases').del()
      .then(() => knex('reminders').del())
      .then(() => knex('queued').del())
      .then(() =>  knex('cases').insert([turnerData()]))
      .then(() => done())
    })

    context("without session set", function() {
        context("with 1 matching court case", function() {
            var params = { Body: " 4928456 ", From: "+12223334444"};

            beforeEach(function(done) {
                knex('cases').del()
                .then(() => knex('cases').insert([turnerData("")]))
                .then(() => done());
            });

            it("says there is a court case and prompts for reminder", function(done) {
                sess.post('/sms')
                .send(params)
                .expect(200)
                .end(function(err, res) {
                    if (err) return done(err);
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>We found a case for Frederick Turner scheduled on Fri, Mar 27th at 1:00 PM, at CNVCRT. Would you like a courtesy reminder the day before? (reply YES or NO)</Sms></Response>');
                    done();
                });
            });

            it("strips emojis from a text", function (done) {
                sess.post('/sms')
                .send({
                    Body: '4928456 😁',
                    From: "+12223334444"
                })
                .expect(200)
                .end(function(err, res) {
                    if(err) return done(err);
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>We found a case for Frederick Turner scheduled on Fri, Mar 27th at 1:00 PM, at CNVCRT. Would you like a courtesy reminder the day before? (reply YES or NO)</Sms></Response>');
                    done();
                });
            });

            it("strips everything after newlines and carriage returns from id", function (done) {
                sess.post('/sms')
                .send({
                    Body: '4928456\r\n-Simon',
                    From: "+12223334444"
                })
                .expect(200)
                .end(function(err, res) {
                    if(err) return done(err);
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>We found a case for Frederick Turner scheduled on Fri, Mar 27th at 1:00 PM, at CNVCRT. Would you like a courtesy reminder the day before? (reply YES or NO)</Sms></Response>');
                    done();
                });
            });

            it("strips everything after newlines and carriage returns from id", function (done) {
                sess.post('/sms')
                .send({
                    Body: '4928456\n-Simon',
                    From: "+12223334444"
                })
                .expect(200)
                .end(function(err, res) {
                    if(err) return done(err);
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>We found a case for Frederick Turner scheduled on Fri, Mar 27th at 1:00 PM, at CNVCRT. Would you like a courtesy reminder the day before? (reply YES or NO)</Sms></Response>');
                    done();
                });
            });

            it("sets match and askedReminder on session", function(done) {
                sess.post('/sms')
                .send(params)
                .expect(200)
                .end(function(err, res) {
                    if (err)  return done(err);
                    expect(getConnectCookie().askedQueued).to.equal(false);
                    expect(getConnectCookie().askedReminder).to.equal(true);
                    expect(getConnectCookie().match).to.deep.equal(rawTurnerDataAsObject(""));
                    done();
                });
            });
        });

        context("with 0 matching court cases", function() {
            context("with a citation length between 6-25 inclusive", function() {
                var params = { Body: "123456", From: "+12223334444" };

                it("says we couldn't find their case and prompt for reminder", function(done) {
                    sess.post('/sms')
                    .send(params)
                    .expect(200)
                    .end(function(err, res) {
                        if (err)  return done(err);
                        expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Could not find a case with that number. It can take several days for a case to appear in our system. Would you like us to keep checking for the next ' + process.env.QUEUE_TTL_DAYS + ' days and text you if we find it? (reply YES or NO)</Sms></Response>');
                        //expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>(1/2) Could not find a case with that number. It can take several days for a case to appear in our system.</Sms><Sms>(2/2) Would you like us to keep checking for the next ' + process.env.QUEUE_TTL_DAYS + ' days and text you if we find it? (reply YES or NO)</Sms></Response>');
                        done();
                    });
                });

                it("sets the askedQueued and citationId cookies", function(done) {
                    sess.post('/sms')
                    .send(params)
                    .expect(200)
                    .end(function(err, res) {
                        if (err) return done(err);
                        expect(getConnectCookie().askedQueued).to.equal(true);
                        expect(getConnectCookie().askedReminder).to.equal(false);
                        expect(getConnectCookie().citationId).to.equal("123456");
                        done();
                    });
                });
            });

            context("the citation length is too short", function() {
                var params = { Body: "12345", From: "+12223334444"  };

                it("says that case id is wrong", function(done) {
                    sess.post('/sms')
                    .send(params)
                    .expect(200)
                    .end(function(err, res) {
                        if (err) return done(err);
                        expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Couldn&apos;t find your case. Case identifier should be 6 to 25 numbers and/or letters in length.</Sms></Response>');
                        expect(getConnectCookie().askedQueued).to.equal(undefined);
                        expect(getConnectCookie().askedReminder).to.equal(undefined);
                        expect(getConnectCookie().citationId).to.equal(undefined);
                        done();
                    });
                 });
             });
        });

        context("Same day court case or or case already happened", function() {
            var params = { Body: "4928456", From: "+12223334444"  };

            it("says case is same day", function(done) {
                knex('cases').del()
                .then(() => knex('cases').insert([turnerData("", dates.now().add(1, "hours"))]))
                .then(() => {
                    sess.post('/sms').send(params)
                    .expect(200)
                    .end(function (err, res) {
                        if (err) return done(err);
                        expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>We found a case for Frederick Turner scheduled today at 1:00 PM, at CNVCRT. Would you like a courtesy reminder the day before a future hearing? (reply YES or NO)</Sms></Response>');
                        expect(getConnectCookie().askedQueued).to.equal(false);
                        expect(getConnectCookie().askedReminder).to.equal(true);
                        expect(getConnectCookie().citationId).to.equal(undefined);
                        done();
                    });
                });
            });

            it("says case is already happening (time is now)", function (done) {
                knex('cases').del()
                .then(() => knex('cases').insert([turnerData("", dates.now())]))
                .then(() => {
                    sess.post('/sms').send(params)
                    .expect(200)
                    .end(function (err, res) {
                        if (err) return done(err);
                        expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>We found a case for Frederick Turner scheduled today at 12:00 PM, at CNVCRT. Would you like a courtesy reminder the day before a future hearing? (reply YES or NO)</Sms></Response>');
                        expect(getConnectCookie().askedQueued).to.equal(false);
                        expect(getConnectCookie().askedReminder).to.equal(true);
                        expect(getConnectCookie().citationId).to.equal(undefined);
                        done();
                    });
                });
            });

            it("says case is already happening (time in the past)", function (done) {
                knex('cases').del()
                .then(() => knex('cases').insert([turnerData("", dates.now().subtract(2, "hours"))]))
                .then(() => {
                    sess.post('/sms').send(params)
                    .expect(200)
                    .end(function (err, res) {
                        if (err) return done(err);
                        expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>We found a case for Frederick Turner scheduled today at 10:00 AM, at CNVCRT. Would you like a courtesy reminder the day before a future hearing? (reply YES or NO)</Sms></Response>');
                        expect(getConnectCookie().askedQueued).to.equal(false);
                        expect(getConnectCookie().askedReminder).to.equal(true);
                        expect(getConnectCookie().citationId).to.equal(undefined);
                        done();
                    });
                });
            });
        });
    });

    context("with session.askedReminder", function() {
    // Build json object, serialize, sign, encode
        var cookieObj = rawTurnerDataAsObject();
        var cookieStr = 'j:{"match":' + JSON.stringify(cookieObj) + ',"askedReminder":true}';
        cookieStr = cookieStr + "." + crypto
                .createHmac('sha256', process.env.COOKIE_SECRET)
                .update(cookieStr)
                .digest('base64')
                .replace(/\=+$/, '');
        cookieStr = "s:" + cookieStr;
        // var cookieArr = ['connect.sess=s%3Aj%3A%7B%22match%22%3A%7B%22id%22%3A%22677167760f89d6f6ddf7ed19ccb63c15486a0eab%22%2C%22defendant%22%3A%22TURNER%2C%20FREDERICK%20T%22%2C%22date%22%3A%222015-03-27T00%3A00%3A00.000Z%22%2C%22time%22%3A%2201%3A00%3A00%20PM%22%2C%22room%22%3A%22CNVCRT%22%2C%22citations%22%3A%5B%7B%22id%22%3A%224928456%22%2C%22violation%22%3A%2240-8-76.1%22%2C%22description%22%3A%22SAFETY%20BELT%20VIOLATION%22%2C%22location%22%3A%2227%20DECAATUR%20ST%22%7D%5D%7D%2C%22askedReminder%22%3Atrue%7D.LJMfW%2B9Dz6BLG2mkRlMdVVnIm3V2faxF3ke7oQjYnls; Path=/; HttpOnly'];
        var cookieArr = ['connect.sess=' + encodeURIComponent(cookieStr) + '; Path=/; HttpOnly'];

        describe("User responding askedReminder session", function() {
            it("YES - creates a reminder and responds appropriately", function (done) {
                var params = { Body: " yEs ", From: "+12223334444" };
                sess.post('/sms').set('Cookie', cookieArr[0]).send(params)
                .expect(200)
                .end(function (err, res) {
                    if (err)  return done(err);

                    //expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>(1/2) Sounds good. We will attempt to text you a courtesy reminder the day before your hearing date. Note that court schedules frequently change.</Sms><Sms>(2/2) You should always confirm your hearing date and time by going to ' + process.env.COURT_PUBLIC_URL + '</Sms></Response>');
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Sounds good. We will attempt to text you a courtesy reminder the day before your hearing date. Note that court schedules frequently change. You should always confirm your hearing date and time by going to http://courts.alaska.gov.</Sms></Response>');
                    expect(getConnectCookie().askedReminder).to.equal(false);

                    knex("reminders").select("*").groupBy("reminders.reminder_id").count('* as count')
                    .then((rows) => {
                        var record = rows[0];
                        expect(record.count).to.equal('1');
                        expect(record.phone).to.equal(db.encryptPhone('+12223334444'));
                        expect(record.case_id).to.equal('677167760f89d6f6ddf7ed19ccb63c15486a0eab');
                        expect(record.sent).to.equal(false);
                        expect(record.original_case).to.deep.equal(rawTurnerDataAsObject("", false));
                        })
                    .then(done, done)
                });
            });

            it("NO - doesn't create a reminder and responds appropriately", function (done) {
                var params = { Body: " nO ", From: "+12223334444" };
                sess.post('/sms').set('Cookie', cookieArr).send(params)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>OK. You can always go to ' + process.env.COURT_PUBLIC_URL + ' for more information about your case and contact information.</Sms></Response>');
                    expect(getConnectCookie().askedReminder).to.equal(false);
                    knex("reminders").count('* as count')
                    .then((rows) => {
                        expect(rows[0].count).to.equal('0');
                    })
                    .then(done, done)
                });
            });
        });
    });


    context("with askedReminder from Queued trigger", function() {
        beforeEach(function (done) {
            return knex('cases').del()
            .then(() => knex('reminders').del())
            .then(() => knex('cases').insert([turnerData()]))
            .then(() => knex("queued").del())
            .then(() => {
                return knex('queued').insert({
                    citation_id: "4928456",
                    sent: true,
                    phone: db.encryptPhone('+12223334444'),
                    asked_reminder: true,
                    asked_reminder_at: "NOW()",
                    created_at: "NOW()"
                })
            })
            .then(() => done())
        });

        describe("User responding to a queued message", function() {
            var cookieArr = [""];

            it("YES - creates a reminder and responds appropriately", function (done) {
                var params = { Body: " yEs ", From: "+12223334444" };
                sess.post('/sms').set('Cookie', cookieArr[0]).send(params)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    //expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>(1/2) Sounds good. We will attempt to text you a courtesy reminder the day before your case. Note that case schedules frequently change.</Sms><Sms>(2/2) You should always confirm your case date and time by going to ' + process.env.COURT_PUBLIC_URL + '</Sms></Response>');
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Sounds good. We will attempt to text you a courtesy reminder the day before your hearing date. Note that court schedules frequently change. You should always confirm your hearing date and time by going to http://courts.alaska.gov.</Sms></Response>');
                    expect(getConnectCookie().askedReminder).to.equal(false);
                    knex("reminders").select("*").groupBy("reminders.reminder_id").count('* as count')
                    .then(rows =>  {
                        var record = rows[0];
                        expect(record.count).to.equal('1');
                        expect(record.phone).to.equal(db.encryptPhone('+12223334444'));
                        expect(record.case_id).to.equal('677167760f89d6f6ddf7ed19ccb63c15486a0eab');
                        expect(record.sent).to.equal(false);
                        expect(record.original_case).to.deep.equal(rawTurnerDataAsObject("", false));
                        })
                    .then(done, done)
                });
            });

            it("NO - doesn't create a reminder and responds appropriately", function (done) {
                var params = { Body: " nO ", From: "+12223334444" };
                sess.post('/sms').set('Cookie', cookieArr[0]).send(params)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>OK. You can always go to ' + process.env.COURT_PUBLIC_URL + ' for more information about your case and contact information.</Sms></Response>');
                    expect(getConnectCookie().askedReminder).to.equal(false);
                    knex("reminders").count('* as count')
                    .then(rows => {
                        expect(rows[0].count).to.equal('0')
                    })
                    .then(done, done)
                })
            });
        });
    });

    context("with old askedReminder from Queued trigger", function() {
        beforeEach(function (done) {
            return knex('cases').del()
            .then(() => knex('reminders').del())
            .then(() => knex('cases').insert([turnerData()]))
            .then(() => knex("queued").del())
            .then(() => {
                var oldDate = new Date();
                oldDate.setHours(oldDate.getHours() - 5);
                return knex('queued').insert({
                    citation_id: "4928456",
                    sent: true,
                    phone: db.encryptPhone('+12223334444'),
                    asked_reminder: true,
                    asked_reminder_at: oldDate,
                    created_at: "NOW()"
                })
                .then(() => done());
            });
        });

        describe("User responding to an old queued message", function() {
            var cookieArr = [""];

            it("YES - doesn't find citation", function(done) {
                var params = { Body: " yEs ", From: "+12223334444" };
                sess.post('/sms').send(params)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Couldn&apos;t find your case. Case identifier should be 6 to 25 numbers and/or letters in length.</Sms></Response>');
                    expect(getConnectCookie().askedQueued).to.equal(undefined);
                    expect(getConnectCookie().askedReminder).to.equal(undefined);
                    expect(getConnectCookie().citationId).to.equal(undefined);
                    done();
                });
            });

            it("NO - doesn't find citation", function(done) {
                var params = { Body: " nO ", From: "+12223334444" };
                sess.post('/sms').send(params)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Couldn&apos;t find your case. Case identifier should be 6 to 25 numbers and/or letters in length.</Sms></Response>');
                    expect(getConnectCookie().askedQueued).to.equal(undefined);
                    expect(getConnectCookie().askedReminder).to.equal(undefined);
                    expect(getConnectCookie().citationId).to.equal(undefined);
                    done();
                });
            });
        });
    });


    context("with session.askedQueued", function() {
        // var cookieArr = ['connect.sess=s%3Aj%3A%7B%22askedQueued%22%3Atrue%2C%22citationId%22%3A%22123456%22%7D.%2FuRCxqdZogql42ti2bU0yMSOU0CFKA0kbL81MQb5o24; Path=/; HttpOnly'];
        var cookieStr = 'j:{"citationId":"123456","askedQueued":true}';
        cookieStr = cookieStr + "." + crypto
            .createHmac('sha256', process.env.COOKIE_SECRET)
            .update(cookieStr)
            .digest('base64')
            .replace(/\=+$/, '');
        cookieStr = "s:" + cookieStr;
        var cookieArr = ['connect.sess='+encodeURIComponent(cookieStr)+'; Path=/; HttpOnly'];

        describe("the user texts YES", function() {
            var params = { Body: " Y ", From: "+12223334444" };
            it("creates a queued", function(done) {
                sess.post('/sms')
                .set('Cookie', cookieArr)
                .send(params)
                .expect(200)
                .end(function(err, res) {
                    if (err) return done(err);
                    knex("queued").select("*").groupBy("queued.queued_id").count('* as count')
                    .then(rows => {
                        var record = rows[0];
                        expect(record.count).to.equal('1');
                        expect(record.phone).to.equal(db.encryptPhone('+12223334444'));
                        expect(record.citation_id).to.equal('123456');
                        expect(record.sent).to.equal(false);
                    })
                    .then(done, done);
                });
            });

            it("tells the user we'll text them", function(done) {
                sess.post('/sms')
                .set('Cookie', cookieArr)
                .send(params)
                .expect(200)
                .end(function(err, res) {
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>OK. We will keep checking for up to ' + process.env.QUEUE_TTL_DAYS + ' days. You can always go to ' + process.env.COURT_PUBLIC_URL + ' for more information about your case and contact information.</Sms></Response>');
                    expect(getConnectCookie().askedQueued).to.equal(false);
                    done();
                });
            });
        });

        describe("the user texts NO", function() {
            var params = { Body: " No ", From: "+12223334444" };

            it("doesn't create a queued", function(done) {
                sess.post('/sms')
                .set('Cookie', cookieArr)
                .send(params)
                .expect(200)
                .end(function(err, res) {
                    if (err)  return done(err);
                    knex("queued").count('* as count')
                    .then(function(rows) {
                        expect(rows[0].count).to.equal('0');
                        done();
                    })
                    .catch(err => done(err))
                });
            });

            it("tells the user where to get more info", function(done) {
                sess.post('/sms')
                .set('Cookie', cookieArr)
                .send(params)
                .expect(200)
                .end(function(err, res) {
                    expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>OK. You can always go to ' + process.env.COURT_PUBLIC_URL + ' for more information about your case and contact information.</Sms></Response>');
                    expect(getConnectCookie().askedQueued).to.equal(false);
                    done();
                });
            });
        });
    });
});

function turnerData(v,d) {
  return {
    //date: '27-MAR-15',
    date: d||TEST_UTC_DATE,
    defendant: 'Frederick Turner',
    room: 'CNVCRT',
    time: moment.utc(d||TEST_UTC_DATE).format("hh:00:00 A"),
    citations: '[{"id":"4928456","violation":"40-8-76.1","description":"SAFETY BELT VIOLATION","location":"27 DECATUR ST"}]',
    id: '677167760f89d6f6ddf7ed19ccb63c15486a0eab' + (v||"")
  };
}

function turnerDataAsObject(v,d) {
  var data = turnerData(v,d);
  data.date = d||TEST_UTC_DATE;
  data.citations = JSON.parse(data.citations);
  data.readableDate = moment.utc(d||TEST_UTC_DATE).format("dddd, MMM Do");
  return data;
}

function rawTurnerDataAsObject(v,d) {
  var data = turnerData(v,d);
  data.date = d||TEST_UTC_DATE;
  data.citations = JSON.parse(data.citations);
  return data;
}

function getConnectCookie() {
  var sessionCookie = sess.cookies.find(cookie =>  cookie.hasOwnProperty('connect.sess'))
  var cookie = sessionCookie['connect.sess'];
  return cookieParser.JSONCookie(cookieParser.signedCookie(cookie, process.env.COOKIE_SECRET));
}

function sortObject(o) {
  var sorted = {},
      key, a = [];

  for (key in o) {
    if (o.hasOwnProperty(key)) {
      a.push(key);
    }
  }

  a.sort();

  for (key = 0; key < a.length; key++) {
    sorted[a[key]] = o[a[key]];
  }
  return sorted;
}
