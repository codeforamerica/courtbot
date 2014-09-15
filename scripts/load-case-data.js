// Downloads the latest courtdate CSV file and 
// rebuilds the database. For best results, load nightly.
var http = require('http');
var moment = require('moment');
var request = require('request');
var parse = require('csv-parse');
var Promise = require('bluebird');
var sha1 = require('sha1');

var Knex = require('knex');
var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

var loadData = function () {
  var yesterday = moment().subtract('days', 1).format('MMDDYYYY');
  var url = 'http://courtview.atlantaga.gov/courtcalendars/' + 
    'court_online_calendar/codeamerica.' + yesterday + '.csv';

  console.log('Downloading latest CSV file...');
  request.get(url, function(req, res) {
    console.log('Parsing CSV File...');
    parse(res.body, { delimiter: '|', quote: false, escape: false }, function(err, rows) {
      if (err) {
        console.log('Unable to parse file: ', url);
        console.log(err);
        process.exit(1);
      }

      console.log('Extracting court case information...');
      var cases = extractCourtData(rows);
      recreateDB(cases, function() {
        console.log('Database recreated! All systems are go.');
      });
    });
  });
};


// Citation data provided in CSV has a few tricky parsing problems. The
// main of which is that citation numbers can appear multiple times.
// There's actually a couple reasons why:
// 
// 1. Duplicates produced by the SQL query that generates the file
// 2. Date updates -- each date is included. Need to go with latest.
// 3. Cases that use identical citatiation numbers. Typos when put into the system.
var extractCourtData = function(rows) {
  var cases = [];
  var casesMap = {};
  var citationsMap = {};

  var latest = function(date1, date2) {
    if (moment(date1).isAfter(date2)) {
      return date1;
    } else {
      return date2;
    }
  };

  rows.forEach(function(c) {
    var newCitation = {
      id: c[5],
      violation: c[6],
      description: c[7],
      location: c[2],
      payable: c[8],
    };

    var newCase = {
      date: c[0],
      defendant: c[1],
      room: c[3],
      time: c[4],
      citations: [],
    };

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
      prevCase.date = latest(prevCase.date, newCase.date);
    } else if (prevCase) {
      prevCase.date = latest(prevCase.date, newCase.date);
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
      return knex('cases').insert(chunk);
    }));
  };

  knex.schema
    .dropTableIfExists('cases')
    .then(createCasesTable)
    .then(insertCases)
    .then(createIndexingFunction)
    .then(dropIndex)
    .then(createIndex)
    .then(close)
    .then(function() {
      callback();
    });
};

var createCasesTable = function() {
  return knex.schema.createTable('cases', function(table) {
    table.string('id', 100).primary();
    table.string('defendant', 100);
    table.date('date');
    table.string('time', 100);
    table.string('room', 100);
    table.json('citations');
  });
};

// Creating an index for citation ids, stored in a JSON array
// Using this strategy: http://stackoverflow.com/a/18405706
var createIndexingFunction = function () {
  var text = ['CREATE OR REPLACE FUNCTION json_val_arr(_j json, _key text)',
              '  RETURNS text[] AS',
              '$$',
              'SELECT array_agg(elem->>_key)',
              'FROM   json_array_elements(_j) AS x(elem)',
              '$$',
              '  LANGUAGE sql IMMUTABLE;'].join('\n');
  return knex.raw(text);
};

var dropIndex = function() {
  var text = "DROP INDEX IF EXISTS citation_ids_gin_idx";
  return knex.raw(text);
};

var createIndex = function() {
  var text = "CREATE INDEX citation_ids_gin_idx ON cases USING GIN (json_val_arr(citations, 'id'))";
  return knex.raw(text);
};

var close = function() {
  return knex.client.pool.destroy();
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
loadData();
