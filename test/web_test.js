// setup ENV dependencies
process.env.COOKIE_SECRET="test";

var expect = require("chai").expect;
var assert = require("chai").assert;
var nock = require('nock');
var tk = require('timekeeper');
var fs = require('fs');
var Promise = require('bluebird');
var moment = require("moment");
var _ = require("underscore");
var cookieParser = require("cookie-parser");
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

function getConnectCookie() {
  var sessionCookie = _.find(sess.cookies, function(cookie) {
    return _.has(cookie, 'connect.sess');
  });
  var cookie = sessionCookie['connect.sess'];
  return cookieParser.JSONCookie(cookieParser.signedCookie(cookie, process.env.COOKIE_SECRET));
}

describe("GET /", function() {
  it("responds with a simple message", function(done) {
    sess.get('/').
      expect('Content-Length', '79').
      expect(200).
      end(function(err, res) {
        if (err) return done(err);
        expect(res.text).to.contain("Hello, I am Courtbot.");
        done();
      });
  });
});

describe("GET /cases", function() {
  it("400s when there is no ?q=", function(done) {
    sess.get('/cases').
      expect(400, done);
  });

  it("200s + empty array when there is ?q=", function(done) {
    sess.get('/cases?q=test').
      expect(200).
      end(function(err, res) {
        if (err) return done(err);
        expect(res.text).to.equal("[]");
        done();
      });
  });

  it("finds partial matches of name", function(done) {
    knex('cases').del().then(function() {
      knex('cases').insert([turnerData(1), turnerData(2)]).then(function() {
        sess.get('/cases?q=turner').
          expect(200).
          end(function(err, res) {
            if (err) return done(err);
            expect(JSON.parse(res.text)).to.deep.equal([turnerDataAsObject(1), turnerDataAsObject(2)]);
            done();
          });
      });
    });
  });

  it("finds exact matches of id", function(done) {
    knex('cases').del().then(function() {
      knex('cases').insert([turnerData()]).then(function() {
        sess.get('/cases?q=4928456').
          expect(200).
          end(function(err, res) {
            if (err) return done(err);
            expect(JSON.parse(res.text)).to.deep.equal([turnerDataAsObject()]);
            done();
          });
      });
    });
  });

  it("doesnt find partial matches of id", function(done) {
    knex('cases').del().then(function() {
      knex('cases').insert([turnerData()]).then(function() {
        sess.get('/cases?q=492845').
          expect(200).
          end(function(err, res) {
            if (err) return done(err);
            expect(JSON.parse(res.text)).to.deep.equal([]);
            done();
          });
      });
    });
  });
});

describe("POST /sms", function() {
  beforeEach(function(done) {
    knex('cases').del().then(function() {
      knex('cases').insert([turnerData()]).then(function() {
        done();
      });
    });
  });

  context("without session set", function() {
    context("with 1 matching court case", function() {
      var params = { Body: "4928456" };

      context("it can pay online", function() {
        beforeEach(function(done) {
          knex('cases').del().then(function() {
            knex('cases').insert([turnerData("", true)]).then(function() {
              done();
            });
          });
        });

        it("responds that we can pay now and skip court", function(done) {
          done("test pending");
        });

        it("doesn't set anything on session", function(done) {
          sess.
            post('/sms').
            send(params).
            expect(200).
            end(function(err, res) {
              if (err) { return done(err); }
              expect(getConnectCookie().askedQueued).to.equal(undefined);
              expect(getConnectCookie().askedReminder).to.equal(undefined);
              expect(getConnectCookie().citationId).to.equal(undefined);
              done();
            });
        });
      });

      context("it can not be paid online", function() {
        beforeEach(function(done) {
          knex('cases').del().then(function() {
            knex('cases').insert([turnerData("", false)]).then(function() {
              done();
            });
          });
        });

        it("says there is a court case and prompts for reminder", function(done) {
          done("test pending");
        });

        it("sets match and askedReminder on session", function(done) {
          sess.
            post('/sms').
            send(params).
            expect(200).
            end(function(err, res) {
              if (err) { return done(err); }
              expect(getConnectCookie().askedQueued).to.equal(undefined);
              expect(getConnectCookie().askedReminder).to.equal(true);
              expect(getConnectCookie().match).to.deep.equal(rawTurnerDataAsObject("", false));
              done();
            });
        });
      });
    });

    context("with 0 matching court cases", function() {
      context("with a citation length between 6-9 inclusive", function() {
        var params = { Body: "123456" };

        it("says we couldn't find their case and prompt for reminder", function(done) {
          sess.
            post('/sms').
            send(params).
            expect(200).
            end(function(err, res) {
              if (err) { return done(err); }
              expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Couldn&apos;t find your case. It takes 14 days for new citations to appear in the sytem. Would you like a text when we find your information? (Reply YES or NO)</Sms></Response>');
              done();
            });
        });

        it("sets the askedQueued and citationId cookies", function(done) {
          sess.
            post('/sms').
            send(params).
            expect(200).
            end(function(err, res) {
              if (err) { return done(err); }
              expect(getConnectCookie().askedQueued).to.equal(true);
              expect(getConnectCookie().askedReminder).to.equal(undefined);
              expect(getConnectCookie().citationId).to.equal("123456");
              done();
            });
        });
      });

      context("the citation length is too long", function() {
        var params = { Body: "123456789123456" };

        it("says that you need to call", function(done) {
          sess.
            post('/sms').
            send(params).
            expect(200).
            end(function(err, res) {
              if (err) { return done(err); }
              expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Sorry, we couldn&apos;t find that court case. Please call us at (404) 954-7914.</Sms></Response>');
              expect(getConnectCookie().askedQueued).to.equal(undefined);
              expect(getConnectCookie().askedReminder).to.equal(undefined);
              expect(getConnectCookie().citationId).to.equal(undefined);
              done();
          });
        });
      });
    });
  });

  context("with session.askedReminder", function() {

  });

  context("with session.askedQueued", function() {

  });
});

function turnerData(v, payable) {
  if (payable === undefined) {
    payable = true;
  }

  return { date: '27-MAR-15',
    defendant: 'TURNER, FREDERICK T',
    room: 'CNVCRT',
    time: '01:00:00 PM',
    citations: '[{"id":"4928456","violation":"40-8-76.1","description":"SAFETY BELT VIOLATION","location":"27 DECAATUR ST","payable":"' + (payable ? 1 : 0) + '"}]',
    id: '677167760f89d6f6ddf7ed19ccb63c15486a0eab' + (v||"")
  };
}

function turnerDataAsObject(v, payable) {
  if (payable === undefined) {
    payable = true;
  }

  var data = turnerData(v);
  data.date = "2015-03-27T00:00:00.000Z";
  data.citations = JSON.parse(data.citations);
  data.payable = payable;
  data.readableDate = "Thursday, Mar 26th";
  return data;
}

function rawTurnerDataAsObject(v, payable) {
  if (payable === undefined) {
    payable = true;
  }

  var data = turnerData(v, payable);
  data.date = "2015-03-27T00:00:00.000Z";
  data.citations = JSON.parse(data.citations);
  return data;
}
