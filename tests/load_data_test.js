var expect = require("chai").expect;
var assert = require("chai").assert;
var nock = require('nock');
var tk = require('timekeeper');
var Promise = require('bluebird');

describe("Loading of Data", function() {
  var time = new Date(1425297600000); // Freeze to March 2, 2015. Yesterday is March 1
  tk.freeze(time);

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
});
