// Downloads the latest courtdate CSV file and
// rebuilds the database. For best results, load nightly.
var http = require('http');
var request = require('request');
var parse = require('csv-parse');
var sha1 = require('sha1');
var dates = require("./dates");
require('dotenv').config();
var manager = require("./db/manager");
var moment = require("moment-timezone");

// main function that performs the entire load process
function loadData() {
  // determine what urls to load and how to extract them
  // example DATA_URL=http://courtrecords.alaska.gov/MAJIC/sandbox/acs_mo_event.csv
  // example DATA_URL=http://courtrecords.../acs_mo_event.csv|extractCourtData,http://courtrecords.../acs_cr_event.csv|extractCriminalCases
  let files = process.env.DATA_URL.split(',');
  // queue each file and extraction as a promise
  let queue = [];
  files.forEach((item) => {
    let [url, extractor] = item.split('|');
    if (url.trim() != '') {
      // use the specified extractor name to determine which extraction method to use
      // default to the original extraction method
      if (extractor) {
        queue.push(getCases(url, (extractor == 'extractCriminalCases' ?  extractCriminalCases : extractCourtData)));
      } else {
        queue.push(getCases(url, extractCourtData));
      }
    }
  });

  return Promise.all(queue)
  .then(results => [].concat.apply([], results))
  .then(cases => persistCases(cases))
  .then(() => {
    console.log('Data loaded! All systems are go.')
    return true;
  })
}

// fetch the data from the url, parse it and extract it.
function getCases (url, extractionHandler) {
  // get the basename of the file for logging
  let file = url.split('/').reverse()[0];

  return new Promise(function (resolve, reject) {
    console.log(`Downloading CSV file ${file}...`);
    request.get(url, function(req, res) {
      if (res.statusCode == 404) {
        console.log("404 page not found: ", url);
        reject(`404 page not found ${url}`);
      } else {
        console.log(`Parsing CSV file ${file}...`);
        parse(res.body, {delimiter: ','}, function(err, rows) {
          if (err) {
            console.log(`Unable to parse file: ${url}`);
            console.log(err);
            return reject(err);
          }

          console.log(`  extracting information from ${rows.length} rows from ${file}...`);
          let cases = extractionHandler(rows);
          console.log(`  produced ${cases.length} case records from ${file}...`);
          resolve(cases);
        });
      }
    });
  });
};

// Criminal cases have a case number instead of a citation number, and may have multiple
// hearing types possibly on different days or in different locations.  So instead of
// condensing the records as the extractCourtData method does, we are going to keep it
// as-is, but skip full duplicate rows.
function extractCriminalCases(rows) {
  var cases = [];
  var casesMap = {};
  rows.forEach(function(c) {
    var newHearing = {
      id: c[5],
      description: c[6],
      location: c[5].substr(0,3)
    };

    // If we want to test reminders, set all dates to tomorrow
    if (process.env.TEST_TOMORROW_DATES === "1") {
      let before = c[0];
      c[0] = moment().add(1, "days").format("MM/DD/YYYY");
      console.log(`Before: ${before}, After: ${c[0]}`);
    }

    var newCase = {
      date: dates.fromDateAndTime(c[0], c[4]),
      defendant: c[2] + " " + c[1],
      room: c[3],
      time: c[4],
      citations: [ newHearing ]
    };

    // these are what make a case entry unique
    newCase.id = sha1(newCase.defendant + newCase.date + newHearing.id + newHearing.description);
    // exclude duplicates
    if (!casesMap[newCase.id]) {
      cases.push(newCase);
      casesMap[newCase.id] = 1;
    }
  });

  return cases;
}

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
 * @return {array} cases - Cases derrived from citation data
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
    var caseLookup = newCase.id = sha1(newCase.defendant + newCitation.location.slice(0, 3));

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

var insertCases = function(cases) {
  // inserts cases, 1000 at a time.

  // Make violations a JSON blob, to keep things simple
  cases.forEach(function(c) { c.citations = JSON.stringify(c.citations); });

  var chunks = chunk(cases, 1000);
  return Promise.all(chunks.map(function(chunk) {
    return manager.insertTableChunk("cases", chunk);
  }));
};


function persistCases(cases) {
/* note: this creates the table (which also creates and index) then inserts the data,
   according to (https://www.postgresql.org/docs/9.2/static/populate.html)
   this may be slower than inserting bulk data before creating a new index. But, this is much cleaner */
  return manager.dropTable("cases")
    .then(() => manager.createTable("cases"))
    .then(() => insertCases(cases))
    .then(manager.closeConnection)
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
