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

/*
Some complicattions:
Citations can appear multiple times.
  if they are an exact match, it's just a duplicate
  if it's the same except for the later date, go with the later date
  if it's different info altogether, we've got a serious problem...

so, go through and organize the items into objects

foreach
  have we seen this citation before?
  if yes
    either a court date change or a duplicate
  if no
    lookup if we've created a case for it before, based on name+location
      if yes, use the existing id
        if date differs, we've got serious issues
      if no, create a sequential id and populate case data

end result
  cases
  citations
// */

// downloadfile
//   parse it into cases and citations
///   then... put it into the db. i guess we need two


/*

*/
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

    var caseLookup = newCase.defendant + newCitation.location.slice(0, 6);

    // If we've seen this citation before, it's either a duplicate,
    // or an update of the case date. OR, it's a citation with the dpulicate 
    // citation number. grrrrrr.
    var prevCitation = citationsMap[newCitation.citation_number];
    var prevCase = casesMap[caseLookup];

    if (prevCitation && prevCase) {
      if (moment(newCase.date).isAfter(prevCase.date)) {
        console.log('Changing date from', prevCase.date, 'to', newCase.date);
        prevCase.date = newCase.date;
      }
    } else {
      if (casesMap[caseLookup]) {
        newCitation.caseId = casesMap[caseLookup].id;
        // do some date checking here???
      } else {
        cases.push(newCase);
        casesMap[caseLookup] = newCase;

        newCase.id = counter;
        newCitation.caseId = counter;

        counter++;
      }
      
      citations.push(newCitation);
      citationsMap[newCitation.citation_number] = newCitation;
    }
  });

  return {
    cases: cases,
    citations: citations,
  };
};

loadData();