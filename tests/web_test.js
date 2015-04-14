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

describe("GET /", function() {
  it("responds with a simple message", function(done) {
    nock.enableNetConnect();
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
