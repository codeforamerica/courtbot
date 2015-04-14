// setup ENV dependencies
process.env.COOKIE_SECRET="test";

var expect = require("chai").expect;
var assert = require("chai").assert;
var nock = require('nock');
var tk = require('timekeeper');
var fs = require('fs');
var Promise = require('bluebird');
var moment = require("moment");
var request = require('supertest');
var app = require('../web');

var Knex = require('knex');
var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

nock.enableNetConnect('127.0.0.1');

describe("GET /", function() {
  it("responds with a simple message", function(done) {
    request(app)
      .get('/')
      .expect('Content-Length', '79')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        expect(res.text).to.contain("Hello, I am Courtbot.");
        done();
      });
  });
});

describe("GET /cases", function() {
  it("400s when there is no ?q=", function(done) {
    request(app)
      .get('/cases')
      .expect(400, done);
  });

  it("200s + empty array when there is ?q=", function(done) {
    request(app)
      .get('/cases?q=test')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        expect(res.text).to.equal("[]");
        done();
      });
  });

  it("finds exact matches", function(done) {
    knex('cases').del().then(function() {
      knex('cases').insert([turnerData(1), turnerData(2)]).then(function() {
        request(app)
          .get('/cases?q=turner')
          .expect(200)
          .end(function(err, res) {
            if (err) return done(err);
            expect(JSON.parse(res.text)).to.deep.equal([turnerDataAsObject(1), turnerDataAsObject(2)]);
            done();
          });
      });
    });
  });
});

function turnerData(v) {
  return { date: '27-MAR-15',
    defendant: 'TURNER, FREDERICK T',
    room: 'CNVCRT',
    time: '01:00:00 PM',
    citations: '[{"id":"4928456","violation":"40-8-76.1","description":"SAFETY BELT VIOLATION","location":"27 DECAATUR ST","payable":"1"}]',
    id: '677167760f89d6f6ddf7ed19ccb63c15486a0eab' + (v||0)
  };
}

function turnerDataAsObject(v) {
  var data = turnerData(v);
  data.date = "2015-03-27T00:00:00.000Z";
  data.citations = JSON.parse(data.citations);
  data.payable = true;
  data.readableDate = "Thursday, Mar 26th";
  return data;
}
