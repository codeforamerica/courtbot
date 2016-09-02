process.env.COOKIE_SECRET="test";
process.env.PHONE_ENCRYPTION_KEY = "phone_encryption_key";
process.env.TWILIO_ACCOUNT_SID = "test";
process.env.TWILIO_AUTH_TOKEN = "token";
process.env.TWILIO_PHONE_NUMBER = "+test";

var sendQueued = require("../sendQueued.js");
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

describe("with 2 valid queued cases (same citation)", function() {
  beforeEach(function(done) {
    knex('cases').del().then(function() {
      knex('cases').insert([turnerData()]).then(function() {
        knex("queued").del().then(function() {
          db.addQueued({
              citationId: "4928456",
              phone: "+12223334444"
            }, function(err, data) {
            db.addQueued({
              citationId: "4928456",
              phone: "+12223334444"
            }, function(err, data) {
              done(err);
            });
          });
        });
      });
    });
  });

  it("sends the correct info to Twilio and updates the queued to sent", function(done) {
    var number = "+12223334444";
    var message = "Your Alaska State Court information was found: a court case for Frederick Turner on Friday, Mar 27th at 01:00:00 PM, in courtroom CNVCRT. Call us at (907) XXX-XXXX with any questions.";

    nock('https://api.twilio.com:443')
      .post('/2010-04-01/Accounts/test/Messages.json', "To=" + encodeURIComponent(number) + "&From=%2Btest&Body=" + encodeURIComponent(message))
      .reply(200, {"status":200}, { 'access-control-allow-credentials': 'true'});

    nock('https://api.twilio.com:443')
      .post('/2010-04-01/Accounts/test/Messages.json', "To=" + encodeURIComponent(number) + "&From=%2Btest&Body=" + encodeURIComponent(message))
      .reply(200, {"status":200}, { 'access-control-allow-credentials': 'true'});

    sendQueued().then(function(res) {
      knex("queued").select("*").then(function(rows) {
        expect(rows[0].sent).to.equal(true);
        expect(rows[1].sent).to.equal(true);
        done();
      }).catch(done);
    }, done);
  });
});

describe("with a queued non-existent case", function() {
  beforeEach(function(done) {
    knex('cases').del().then(function() {
      knex('cases').insert([turnerData()]).then(function() {
        knex("queued").del().then(function() {
          db.addQueued({
            citationId: "123",
            phone: "+12223334444"
          }, function(err, data) {
            done(err);
          });
        });
      });
    });
  });

  it("doesn't do anything < 16 days", function(done) {
    sendQueued().then(function(res) {
      knex("queued").select("*").then(function(rows) {
        expect(rows[0].sent).to.equal(false);
        done();
      }).catch(done);
    }, done);
  });

  it("sends a failure sms after 16 days", function(done) {
    var number = "+12223334444";
    var message = "We haven\'t been able to find your court case. Please call us at (907) XXX-XXXX. - Alaska State Court System";

    nock('https://api.twilio.com:443')
      .post('/2010-04-01/Accounts/test/Messages.json', "To=" + encodeURIComponent(number) + "&From=%2Btest&Body=" + encodeURIComponent(message))
      .reply(200, {"status":200}, { 'access-control-allow-credentials': 'true'});


    knex("queued").update({created_at: moment().clone().subtract(18, 'days')}).then(function() {
      sendQueued().then(function(res) {
        knex("queued").select("*").then(function(rows) {
          expect(rows[0].sent).to.equal(true);
          done();
        }).catch(done);
      }, done);
    });
  });
});

function turnerData(v, payable) {
  if (payable === undefined) {
    payable = true;
  }

  return { date: '27-MAR-15',
    defendant: 'Frederick Turner',
    room: 'CNVCRT',
    time: '01:00:00 PM',
    citations: '[{"id":"4928456","violation":"40-8-76.1","description":"SAFETY BELT VIOLATION","location":"27 DECAATUR ST","payable":"' + (payable ? 1 : 0) + '"}]',
    id: '677167760f89d6f6ddf7ed19ccb63c15486a0eab' + (v||"")
  };
}
