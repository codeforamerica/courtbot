// setup ENV dependencies
process.env.COOKIE_SECRET="test";
process.env.PHONE_ENCRYPTION_KEY = "phone_encryption_key";

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
      knex('reminders').del().then(function() {
        knex('queued').del().then(function() {
          knex('cases').insert([turnerData()]).then(function() {
            done();
          });
        });
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
          sess.
            post('/sms').
            send(params).
            expect(200).
            end(function(err, res) {
              if (err) { return done(err); }
              expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>You can pay now and skip court. Just call (404) 658-6940 or visit court.atlantaga.gov. \n\nOtherwise, your court date is Thursday, Mar 26th at 01:00:00 PM, in courtroom CNVCRT.</Sms></Response>');
              done();
            });
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
          sess.
            post('/sms').
            send(params).
            expect(200).
            end(function(err, res) {
              if (err) { return done(err); }
              expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Found a court case for Frederick T Turner on Thursday, Mar 26th at 01:00:00 PM, in courtroom CNVCRT. Would you like a reminder the day before? (reply YES or NO)</Sms></Response>');
              done();
            });
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
    // This cookie comes from "sets match and askedReminder on session" in order to avoid finicky node session management / encryption
    // TODO: Have this be a hash that is set and encrypted instead of hardcoded like this
    var cookieArr = ['connect.sess=s%3Aj%3A%7B%22match%22%3A%7B%22id%22%3A%22677167760f89d6f6ddf7ed19ccb63c15486a0eab%22%2C%22defendant%22%3A%22TURNER%2C%20FREDERICK%20T%22%2C%22date%22%3A%222015-03-27T00%3A00%3A00.000Z%22%2C%22time%22%3A%2201%3A00%3A00%20PM%22%2C%22room%22%3A%22CNVCRT%22%2C%22citations%22%3A%5B%7B%22id%22%3A%224928456%22%2C%22violation%22%3A%2240-8-76.1%22%2C%22description%22%3A%22SAFETY%20BELT%20VIOLATION%22%2C%22location%22%3A%2227%20DECAATUR%20ST%22%2C%22payable%22%3A%220%22%7D%5D%7D%2C%22askedReminder%22%3Atrue%7D.LJMfW%2B9Dz6BLG2mkRlMdVVnIm3V2faxF3ke7oQjYnls; Path=/; HttpOnly'];

    describe("the user texts YES", function() {
      var params = { Body: "yEs", From: "+12223334444" };

      it("creates a reminder", function(done) {
        sess.
          post('/sms').
          set('Cookie', cookieArr).
          send(params).
          expect(200).
          end(function(err, res) {
            if (err) { return done(err); }
            setTimeout(function() { // This is a hack because the DB operation happens ASYNC
              knex("reminders").select("*").groupBy("reminders.reminder_id").count('* as count').then(function(rows) {
                var record = rows[0];
                expect(record.count).to.equal('1');
                expect(record.phone).to.equal(cypher("+12223334444"));
                expect(record.case_id).to.equal('677167760f89d6f6ddf7ed19ccb63c15486a0eab');
                expect(record.sent).to.equal(false);
                expect(JSON.parse(record.original_case)).to.deep.equal(rawTurnerDataAsObject("", false));
                done();
              }, done);
            }, 200);
          });
      });

      it("responds to the user about the reminder being created", function(done) {
        sess.
          post('/sms').
          set('Cookie', cookieArr).
          send(params).
          expect(200).
          end(function(err, res) {
            expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Sounds good. We&apos;ll text you a day before your case. Call us at (404) 954-7914 with any other questions.</Sms></Response>');
            expect(getConnectCookie().askedReminder).to.equal(false);
            done();
          });
      });
    });

    describe("the user texts NO", function() {
      var params = { Body: "No", From: "+12223334444" };

      it("doesn't create a reminder", function(done) {
        sess.
          post('/sms').
          set('Cookie', cookieArr).
          send(params).
          expect(200).
          end(function(err, res) {
            if (err) { return done(err); }
            knex("reminders").count('* as count').then(function(rows) {
              expect(rows[0].count).to.equal('0');
              done();
            }, done);
          });
      });

      it("responds to the user with our number", function(done) {
        sess.
          post('/sms').
          set('Cookie', cookieArr).
          send(params).
          expect(200).
          end(function(err, res) {
            expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Alright, no problem. See you on your court date. Call us at (404) 954-7914 with any other questions.</Sms></Response>');
            expect(getConnectCookie().askedReminder).to.equal(false);
            done();
          });
      });
    });
  });

  context("with session.askedQueued", function() {
    // This cookie comes from "sets the askedQueued and citationId cookies" in order to avoid finicky node session management / encryption
    // TODO: Have this be a hash that is set and encrypted instead of hardcoded like this
    var cookieArr = ['connect.sess=s%3Aj%3A%7B%22askedQueued%22%3Atrue%2C%22citationId%22%3A%22123456%22%7D.%2FuRCxqdZogql42ti2bU0yMSOU0CFKA0kbL81MQb5o24; Path=/; HttpOnly'];

    describe("the user texts YES", function() {
      var params = { Body: "Y", From: "+12223334444" };

      it("creates a queued", function(done) {
        sess.
          post('/sms').
          set('Cookie', cookieArr).
          send(params).
          expect(200).
          end(function(err, res) {
            if (err) { return done(err); }
            setTimeout(function() { // This is a hack because the DB operation happens ASYNC
              knex("queued").select("*").groupBy("queued.queued_id").count('* as count').then(function(rows) {
                var record = rows[0];
                expect(record.count).to.equal('1');
                expect(record.phone).to.equal(cypher("+12223334444"));
                expect(record.citation_id).to.equal('123456');
                expect(record.sent).to.equal(false);
                done();
              }, done);
            }, 200);
          });
      });

      it("tells the user we'll text them", function(done) {
        sess.
          post('/sms').
          set('Cookie', cookieArr).
          send(params).
          expect(200).
          end(function(err, res) {
            expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>Sounds good. We&apos;ll text you in the next 14 days. Call us at (404) 954-7914 with any other questions.</Sms></Response>');
            expect(getConnectCookie().askedQueued).to.equal(false);
            done();
          });
      });
    });

    describe("the user texts NO", function() {
      var params = { Body: "No", From: "+12223334444" };

      it("doesn't create a queued", function(done) {
        sess.
          post('/sms').
          set('Cookie', cookieArr).
          send(params).
          expect(200).
          end(function(err, res) {
            if (err) { return done(err); }
            setTimeout(function() { // This is a hack because the DB operation happens ASYNC
              knex("queued").count('* as count').then(function(rows) {
                expect(rows[0].count).to.equal('0');
                done();
              }, done);
            }, 200);
          });
      });

      it("tells the user we'll text them", function(done) {
        sess.
          post('/sms').
          set('Cookie', cookieArr).
          send(params).
          expect(200).
          end(function(err, res) {
            expect(res.text).to.equal('<?xml version="1.0" encoding="UTF-8"?><Response><Sms>No problem. Call us at (404) 954-7914 with any other questions.</Sms></Response>');
            expect(getConnectCookie().askedQueued).to.equal(false);
            done();
          });
      });
    });
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
