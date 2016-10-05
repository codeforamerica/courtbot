require('dotenv').config({silent: true});
var expect = require("chai").expect;
var assert = require("chai").assert;
var nock = require('nock');
var tk = require('timekeeper');
var fs = require('fs');
var Promise = require('bluebird');
var moment = require("moment");
var url = require('url');

var Knex = require('knex');
var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});


var data_hostname = "http://" + url.parse(process.env.DATA_URL).hostname;
console.log("Host: " + data_hostname);
var data_path = url.parse(process.env.DATA_URL).pathname;
console.log("Path: " + data_path);

describe("Loading of Data", function() {
  beforeEach(function() {
    var time = new Date(1425297600000); // Freeze to March 2, 2015. Yesterday is March 1
    tk.freeze(time);
  });

  describe("With a 404 on the CSV", function() {
    nock(data_hostname)
        .get(data_path)
        .reply(404);

    it("hits the error callback with a 404 message", function() {
      return require("../utils/loaddata")().then(assert.failed, function(err) {
        expect(err).to.include("404 page not found");
      });
    });
  });

  describe("With a 200 on the CSV", function() {
    beforeEach(function() {
      nock(data_hostname)
          .get(data_path)
          .reply(200, function() {
            return fs.createReadStream('test/fixtures/acs_mo_event.csv');
          });
    });

    it("hits the success callback correctly", function() {
      return require("../utils/loaddata")().then(function(resp) {
        expect(resp).to.equal(true);
      }, assert.failed);
    });

    it("creates 36 cases", function() { // 38 lines, two sets of duplicates
      return require("../utils/loaddata")().then(function(resp) {
        return knex("cases").count('* as count').then(function(rows) {
          expect(rows[0].count).to.equal('36');
        }, assert.failed);
      }, assert.failed);
    });

    it("properly manages a single defendant", function() {
      return require("../utils/loaddata")().then(function(resp) {
        return knex("cases").where({ defendant: "Christopher Dunlap"}).then(function(rows) {
          expect(rows[0].defendant).to.equal('Christopher Dunlap');
          expect(rows[0].room).to.equal('Petersburg Courthouse');
          expect(rows[0].citations.length).to.equal(1);
          expect(rows[0].citations[0].id).to.equal('PEFEP00391416');
        }, assert.failed);
      }, assert.failed);
    });

    it("properly manages a duplicate defendant", function() {
      return require("../utils/loaddata")().then(function(resp) {
        return knex("cases").where({ defendant: "Michael Guthrie"}).then(function(rows) {
          expect(rows[0].defendant).to.equal('Michael Guthrie');
          expect(rows[0].room).to.equal('Ketchikan Courthouse');
          expect(rows[0].citations.length).to.equal(2);
          expect(rows[0].citations[0].id).to.equal('KETEE000003760305');
          expect(rows[0].citations[1].id).to.equal('KETEE000003760307');
        }, assert.failed);
      }, assert.failed);
    });
  });
});
