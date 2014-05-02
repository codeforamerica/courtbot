//
// Downloads the latest courtdate CSV file and 
// rebuilds the database. For best results, load nightly.
//
var http = require('http');
var moment = require('moment');
var request = require('request');
var parse = require('csv-parse');
var Promise = require('bluebird');

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
    parse(res.body, { delimiter: '|', escape: '"' }, function(err, rows) {
      if (err) {
        console.log('Unable to parse file: ', url);
        process.exit(1);
      }

      console.log('Extracting court case information...');
      var courtData = extractCourtData(rows);
      recreateDB(courtData.cases, courtData.citations, function() {
        console.log('Database recreated! All systems are go.');
      });
    });
  });
};

var createCasesTable = function() {
  return knex.schema.createTable('cases', function(table) {
    table.increments('id').primary();
    table.string('defendant', 100);
    table.date('date');
    table.string('time', 100);
    table.string('room', 100);
  });
};

var createCitationsTable = function() {
  return knex.schema.createTable('citations', function(table) {
    table.increments('id').primary();
    table.string('citation_number', 100);
    table.string('violation', 100);
    table.string('description', 100);
    table.string('payable', 100);
    table.string('caseId', 100);
    table.string('location', 100);
  });
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

var recreateDB = function(cases, citations, callback) {
  // inserts citations, 1000 at a tiem.
  var insertCitations = function() {
    var chunks = chunk(citations, 1000);
    return Promise.all(chunks.map(function(chunk) {
      return knex('citations').insert(chunk);
    }));
  };

  var insertCases = function() {
    var chunks = chunk(cases, 1000);
    return Promise.all(chunks.map(function(chunk) {
      return knex('cases').insert(chunk);
    }));
  };


  knex.schema
    .dropTableIfExists('cases')
    .then(function() {
      return knex.schema.dropTableIfExists('citations');
    })
    .then(createCasesTable)
    .then(insertCases)
    .then(createCitationsTable)
    .then(insertCitations)
    .then(close)
    .then(function() {
      callback();
    });
};

// Citation data provided in CSV has a few tricky parsing problems. The
// main of which is that citation numbers can appear multiple times.
// There's actually a couple reasons why:
// 
// 1. Duplicates produced by the SQL query that generates the file
// 2. Date updates -- each date is included. Need to go with latest.
// 3. Cases that use identical citatiation numbers. Typos when put into the system.
var parseCSV = function(csv, callback) {
  if (!csv) return callback(undefined, []);

  fs.readFile(csv, function(err, data) {
    if (err) return callback(undefined, []);
    parse(data, {delimiter: '|', escape: '"'}, callback);
  });
};

var extractCourtData = function(rows) {
  var cases = [];
  var casesMap = {};

  var citations = [];
  var citationsMap = {};

  var counter = 1;
  var duplicatecount = 0;

  var latest = function(date1, date2) {
    if (moment(date1).isAfter(date2)) {
      return date1;
    } else {
      return date2;
    }
  };

  rows.forEach(function(c) {
    var newCitation = {
      citation_number: c[5],
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
    };

    // Since no values here are actually unique, we create some lookups
    var citationLookup = newCitation.citation_number + newCitation.violation;
    var caseLookup = newCase.defendant + newCitation.location.slice(0, 6);

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

      newCitation.caseId = prevCase.id;
      citations.push(newCitation);
      citationsMap[citationLookup] = newCitation;
    } else {
      newCase.id = counter;
      cases.push(newCase);
      casesMap[caseLookup] = newCase;

      newCitation.caseId = counter;
      citations.push(newCitation);
      citationsMap[citationLookup] = newCitation;

      counter++;
    }
  });

  return {
    cases: cases,
    citations: citations,
  };
};

loadData();