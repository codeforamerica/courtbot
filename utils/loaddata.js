// Downloads the latest courtdate CSV file and
// rebuilds the database. For best results, load nightly.
var http = require('http');
var request = require('request');
var parse = require('csv-parse');
var Promise = require('bluebird');
var callFn = require("./promises").callFn;
var sha1 = require('sha1');
var dates = require("./dates");
require('dotenv').config();
var manager = require("./db/manager");
var moment = require("moment-timezone");

var loadData = function () {
  var url = process.env.DATA_URL;

  console.log('Downloading latest CSV file...');

  return new Promise(function (resolve, reject) {
    request.get(url, function(req, res) {
      console.log('Parsing CSV File...');

      if (res.statusCode == 404) {
        console.log("404 page not found: ", url);
        reject("404 page not found");
      } else {
        parse(res.body, {delimiter: ','}, function(err, rows) {
          if (err) {
            console.log('Unable to parse file: ', url);
            console.log(err);
            reject(err);
          }

          console.log('Extracting court case information...');
          var cases = extractCourtData(rows);
          recreateDB(cases, function() {
            console.log('Database recreated! All systems are go.');
            resolve(true);
          });
        });
      }
    });
  });
};

/**
 *  Citation data provided in CSV has a few tricky parsing problems. The
 *  main of which is that citation numbers can appear multiple times.
 *  There's actually a couple reasons why:
 *
 *  1. Duplicates produced by the SQL query that generates the file
 *  2. Date updates -- each date is included. Need to go with latest.
 *  3. Cases that use identical citatiation numbers. Typos when put into the system.
 *
 * @param  {array} rows - Citation records
 * @return {date} cases - Cases derrived from citation data
 */
var extractCourtData = function(rows) {
  var cases = [];
  var casesMap = {};
  var citationsMap = {};

  rows.forEach(function(c) {
    var citationInfo = c[8].split(":");
    var newCitation = {
      id: c[6],
      violation: citationInfo[0],
      description: citationInfo[1],
      location: c[6].substr(0,3)
    };

    // If we want to test reminders, set all dates to tomorrow
    if (process.env.TEST_TOMORROW_DATES === "1") {
      console.log("Before: " + c[0]);
      c[0] = moment().add(1, "days").format("MM/DD/YYYY");
      console.log("After: " + c[0]);
    }

    var newCase = {
      date: dates.fromDateAndTime(c[0], c[5]), 
      defendant: c[2] + " " + c[1],
      room: c[4],
      time: c[5],
      citations: []
    };

    //console.log("INCOMING: ", c[0], "|", c[5], "|", newCase.date);

    // Since no values here are actually unique, we create some lookups
    var citationLookup = newCitation.id + newCitation.violation;
    var caseLookup = newCase.id = sha1(newCase.defendant + newCitation.location.slice(0, 6));

    // The checks below handle the multiple citations in the dataset issue.
    // See above for a more detailed explanation.
    var prevCitation = citationsMap[citationLookup];
    var prevCase = casesMap[caseLookup];

    // If we've seen this citation and case, this is just a date update.
    // If we've seen this case, this is an additional citation on it
    // Otherwise, both the case and the citation are new.
    if (prevCitation && prevCase) {
      prevCase.date = moment.max(prevCase.date, newCase.date);
    } else if (prevCase) {
      prevCase.date = moment.max(prevCase.date, newCase.date);
      prevCase.citations.push(newCitation);
      citationsMap[citationLookup] = newCitation;
    } else {
      cases.push(newCase);
      casesMap[caseLookup] = newCase;

      newCase.citations.push(newCitation);
      citationsMap[citationLookup] = newCitation;
    }
  });

  return cases;
};

var recreateDB = function(cases, callback) {
  // inserts cases, 1000 at a time.
  var insertCases = function() {
    // Make violations a JSON blob, to keep things simple
    cases.forEach(function(c) { c.citations = JSON.stringify(c.citations); });

    var chunks = chunk(cases, 1000);
    return Promise.all(chunks.map(function(chunk) {
      return manager.insertTableChunk("cases", chunk);
    }));
  };

  manager.dropTable("cases")
    .then(callFn(manager.createTable, "cases", insertCases))
    .then(manager.closeConnection)
    .then(callback);
};

var chunk = function(arr, len) {
  var chunks = [];
  var i = 0;
  var n = arr.length;

  while (i < n) {
    chunks.push(arr.slice(i, i += len));
  }

  return chunks;
};

// Do the thing!

module.exports = loadData;
