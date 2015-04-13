var expect = require("chai").expect;
var assert = require("chai").assert;
var nock = require('nock');
var tk = require('timekeeper');
var fs = require('fs');
var Promise = require('bluebird');
var moment = require("moment");

var Knex = require('knex');
var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

describe("Loading of Data", function() {
  beforeEach(function() {
    var time = new Date(1425297600000); // Freeze to March 2, 2015. Yesterday is March 1
    tk.freeze(time);
  });

  describe("With a 404 on the CSV", function() {
    nock('http://courtview.atlantaga.gov')
      .get('/courtcalendars/court_online_calendar/codeamerica.03012015.csv')
      .reply(404);

    it("hits the error callback with a 404 message", function() {
      return require("../utils/loaddata")().then(assert.failed, function(err) {
        expect(err).to.include("404 page not found");
      });
    });
  });

  describe("With a 200 on the CSV", function() {
    beforeEach(function() {
      nock('http://courtview.atlantaga.gov')
        .get('/courtcalendars/court_online_calendar/codeamerica.03012015.csv')
        .reply(200, function() {
          return fs.createReadStream('tests/fixtures/codeamerica.03012015.csv');
        });
    });

    it("hits the success callback correctly", function() {
      return require("../utils/loaddata")().then(function(resp) {
        expect(resp).to.equal(true);
      }, assert.failed);
    });

    it("creates 38 cases", function() { // there are 41 rows but 3 are repeats
      return require("../utils/loaddata")().then(function(resp) {
        return knex("cases").count('* as count').then(function(rows) {
          expect(rows[0].count).to.equal('38');
        }, assert.failed);
      }, assert.failed);
    });

    it("properly manages a single defendant", function() {
      return require("../utils/loaddata")().then(function(resp) {
        return knex("cases").where({ defendant: "BARBER, DIANA S."}).then(function(rows) {
          expect(rows[0].defendant).to.equal('BARBER, DIANA S.');
          expect(rows[0].room).to.equal('CNVCRT');
          expect(rows[0].citations.length).to.equal(1);
          expect(rows[0].citations[0].id).to.equal('4736480');
        }, assert.failed);
      }, assert.failed);
    });

    it("properly manages a duplicate defendant", function() {
      return require("../utils/loaddata")().then(function(resp) {
        return knex("cases").where({ defendant: "RUCKER, SEAN D"}).then(function(rows) {
          expect(rows[0].defendant).to.equal('RUCKER, SEAN D');
          expect(rows[0].room).to.equal('JRYASM');
          expect(rows[0].citations.length).to.equal(2);
          expect(rows[0].citations[0].id).to.equal('4849358');
          expect(rows[0].citations[1].id).to.equal('4849359');
        }, assert.failed);
      }, assert.failed);
    });
  });
});
