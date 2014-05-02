var fs = require('fs');
var parse = require('csv-parse');

var Knex = require('knex');
var Promise = require('bluebird');

var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

var createCasesTable = function() {
  return knex.schema.createTable('cases2', function(table) {
    table.increments('id').primary();
    table.string('defendant', 100);
    table.date('date');
    table.string('time', 100);
    table.string('room', 100);
  });
};

var createCitationsTable = function() {
  return knex.schema.createTable('citations', function(table) {
    table.string('id').primary();
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
      return knex('cases2').insert(chunk);
    }));
  };


  knex.schema
    .dropTableIfExists('cases2')
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


var parseCSV = function(csv, callback) {
  if (!csv) return callback(undefined, []);

  fs.readFile(csv, function(err, data) {
    if (err) return callback(undefined, []);
    parse(data, {delimiter: '|', escape: '"'}, callback);
  });
};

var cases = [];
var casesMap = {};

var citations = [];
var citationsMap = {};

var counter = 1;
var duplicatecount = 0;

parseCSV(__dirname + '/tmp/codeamerica.04302014.csv', function(err, rows) {
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
    };

    var caseLookup = newCase.defendant + newCase.location;

    // If we've seen this citation before, it's either a duplicate,
    // or an update of the case date.
    var prevCitation = citationsMap[newCitation.id];
    if (prevCitation) {
      //console.log(caseLookup);
      var prevCase = casesMap[caseLookup];
      if (!prevCase) {
        console.log('Duplicate citation number, sigh.', newCitation);
        // i'm not sure what we should do for these cases
        // sometimes it's re-use of citation number
        // other times it's an update
        // and other times it's multiple court cases???
        return;
      }
      if (prevCase.date !== newCase.date) {
        duplicatecount++;
        // console.log(newCitation.id, prevCase.courtDate, newCase.courtDate);
      }

      // get the case
      // compare the dates
      // update as needed
    } else {
      
      var caseId;

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
      citationsMap[newCitation.id] = newCitation;
    }
  });
  recreateDB(cases, citations, function(){
    console.log('done!');
  });
  console.log('Duplicates: ', duplicatecount);
  // console.log(cases);
});