// setup ENV dependencies
process.env.COOKIE_SECRET="test";
process.env.PHONE_ENCRYPTION_KEY = "phone_encryption_key";
process.env.QUEUE_TTL_DAYS=10;
process.env.COURT_PUBLIC_URL="http://courts.alaska.gov";

var expect = require("chai").expect;
var assert = require("chai").assert;
var nock = require('nock');
var tk = require('timekeeper');
var fs = require('fs');
var Promise = require('bluebird');
var moment = require("moment");
var _ = require("underscore");
var cookieParser = require("cookie-parser");
var crypto = require('crypto');
var Session = require('supertest-session')({
  app: require('../web')
});

var sess;

beforeEach(function () {
  sess = new Session();
});

afterEach(function () {
  sess.destroy();
});

var Knex = require('knex');
var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

nock.enableNetConnect('127.0.0.1');


describe("POST /sms", function() {
  context("with askedReminder from Queued trigger", function() {
    beforeEach(function () {
      return knex('cases').del().then(function() {
        return knex('reminders').del().then(function() {
          return knex('cases').insert([turnerData()]).then(function() {
            return knex("queued").del().then(function () {
              var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
              var encryptedPhone = cipher.update("+12223334444", 'utf8', 'hex') + cipher.final('hex');
              return knex('queued').insert({
                citation_id: "4928456",
                sent: true,
                phone: encryptedPhone,
                asked_reminder: true,
                asked_reminder_at: "NOW()",
                created_at: "NOW()"
              }).then(function () {
                // done();
              });
            });
          });
        });
      });
    });
    describe("User responding to a queued message", function() {
      var cookieArr = [""];
      it("YES - creates a reminder and responds appropriately", function (done) {
        var params = { Body: "yEs", From: "+12223334444" };
        console.log("Params: " + JSON.stringify(params));
        sess.post('/sms').set('Cookie', cookieArr[0]).send(params).expect(200).end(function (err, res) {
          if (err) {
            return done(err);
          }
          expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>(1/2) Sounds good. We will attempt to text you a courtesy reminder the day before your case. Note that case schedules frequently change.</Sms><Sms>(2/2) You should always confirm your case date and time by going to ' + process.env.COURT_PUBLIC_URL + '</Sms></Response>');
          expect(getConnectCookie().askedReminder).to.equal(false);
          setTimeout(function () { // This is a hack because the DB operation happens ASYNC
            knex("reminders").select("*").groupBy("reminders.reminder_id").count('* as count').then(function (rows) {
              var record = rows[0];
              expect(record.count).to.equal('1');
              expect(record.phone).to.equal(cypher("+12223334444"));
              expect(record.case_id).to.equal('677167760f89d6f6ddf7ed19ccb63c15486a0eab');
              expect(record.sent).to.equal(false);
              expect(record.original_case).to.deep.equal(rawTurnerDataAsObject("", false));
              done();
            }, done(err));
          }, 2000);
          done();
        });
      });
      it("NO - doesn't create a reminder and responds appropriately", function (done) {
        var params = { Body: "nO", From: "+12223334444" };
        console.log("Params: " + JSON.stringify(params));
        sess.post('/sms').set('Cookie', cookieArr[0]).send(params).expect(200).end(function (err, res) {
          if (err) {
            return done(err);
          }
          expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>OK. You can always go to ' + process.env.COURT_PUBLIC_URL + ' for more information about your case and contact information.</Sms></Response>');
          expect(getConnectCookie().askedReminder).to.equal(false);
          knex("reminders").count('* as count').then(function (rows) {
            expect(rows[0].count).to.equal('0');
          }, done(err));
        });
      });
    });
  });

});

function turnerData(v) {
  return { date: '27-MAR-15',
    defendant: 'Frederick Turner',
    room: 'CNVCRT',
    time: '01:00:00 PM',
    citations: '[{"id":"4928456","violation":"40-8-76.1","description":"SAFETY BELT VIOLATION","location":"27 DECATUR ST"}]',
    id: '677167760f89d6f6ddf7ed19ccb63c15486a0eab' + (v||"")
  };
}

function turnerDataAsObject(v) {
  var data = turnerData(v);
  data.date = "2015-03-27T08:00:00.000Z";
  data.citations = JSON.parse(data.citations);
  data.readableDate = "Friday, Mar 27th";
  return data;
}

function rawTurnerDataAsObject(v) {
  var data = turnerData(v);
  data.date = "2015-03-27T08:00:00.000Z";
  data.citations = JSON.parse(data.citations);
  return data;
}

function getConnectCookie() {
  var sessionCookie = _.find(sess.cookies, function(cookie) {
    return _.has(cookie, 'connect.sess');
  });
  var cookie = sessionCookie['connect.sess'];
  return cookieParser.JSONCookie(cookieParser.signedCookie(cookie, process.env.COOKIE_SECRET));
}

function cypher(phone) {
  var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  return cipher.update(phone, 'utf8', 'hex') + cipher.final('hex');
}
