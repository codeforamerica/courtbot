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
});
