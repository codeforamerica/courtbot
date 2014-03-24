var fs = require('fs');
var http = require('http')
var csv = require('csv');
var _ = require('underscore');
var Knex = require('knex');
var Promise = require('bluebird');
var moment = require('moment');
var pdf2csv = require('./pdf2csv');

var DAYS_TO_DOWNLOAD = 30;
var COURTVIEW_URL = 'http://courtview.atlantaga.gov/courtcalendars/D';
var DATA_DIRECTORY = __dirname + '/tmp/';

var SCRAPED_DATA = [];

var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

var createTable = function() {
  return knex.schema.createTable('cases', function(t) {
    t.increments('id').primary();
    t.string('defendant', 100);
    t.string('room', 100);
    t.string('date', 100);
    t.string('time', 100);
    t.string('citation', 100);
    t.string('violation_code', 100);
    t.string('violation_desc', 100);
  });
}

var downloadCaseData = function() {
  var download = function(url, dest, cb) {
    var request = http.get(url, function(response) {
      if (response.statusCode === 404) {
        console.log('Couldn\'t find ' + url);
        // return;
      }

      var file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', function() {
        file.close();
        cb();
      });

      file.on('close', function() {
        pdf2csv.convert(dest, dest + '.csv');
      })
    });
  }

  var day = moment();
  for (var i = 0; i < DAYS_TO_DOWNLOAD; i++) {
    var pdfName = day.format('YYMMDD') + '.pdf';
    download(COURTVIEW_URL + pdfName, DATA_DIRECTORY + pdfName, function(){});
    day.add('days', 1);
  }

  return new Promise(function(resolve) {
    // workaround...
    setTimeout(resolve, 30000);
  });
}

var parseCaseData = function() {  
  var allData = [];
  var citations = [];

  for (var i = 0; i < DAYS_TO_DOWNLOAD; i++) {
    var day = moment().add('days', i);
    var csvFile = DATA_DIRECTORY + day.format('YYMMDD') + '.pdf' + '.csv';

    var exists = fs.existsSync(csvFile);
    if (exists) {
      csv()
      .from.path(csvFile, { delimiter: ',', escape: '"' })
      .to.array(function(data) {
        var prevLine = false;

        data.forEach(function(line) {
          if (prevLine) {
            line = prevLine.concat(line);
            prevLine = false;
          }

          // Short lines are usually parser errors and should be ignored
          if (line.length < 4) return;

          // Ignore the lines that are just table headers
          if (line[0] === 'Defendant') return;

          // If we've got 4 values, but not 5, the parser has accidently wrapped.
          // Saved the data and use it for the next line
          if (!line[4]) {
            prevLine = line;
            return;
          }

          var caseData = {
            defendant: parseDefendant(line[4]),
            room: line[0],
            date: day.format('MMM Do'),
            time: line[1].trim(),
            citation: parseCitation(line[5]),
            violation_code: line[2],
            violation_desc: line[3],
          };

          allData.push(caseData);
          citations.push(caseData.citation);
        });
        console.log('Data imported. Number of cases: ' + citations.length);
      })
    }
  }

  return new Promise(function(resolve) {
    SCRAPED_DATA = allData;
    setTimeout(resolve, 5000);
  });
}

var parseCitation = function(citation) {
  // Remove the 'THE CITY OF ATLANTA MUNICIPAL COURT' string
  // that sometimes gets mixed in because of the broken parser
  var hasJunk = citation.indexOf("THE CITY OF ATLANTA MUNICIPAL COURT");
  if (hasJunk > -1) citation = citation.substring(0, hasJunk);

  return citation;
};

var parseDefendant = function(defendant) {
  return defendant;
};

// Inserts data into postgres, chunking it into 1000 rows at a time, for performance reasons
var populateTable = function(caseData, index) {
  index = index || 0;
  caseData = SCRAPED_DATA; // temp hack
  if (index > caseData.length) return knex('cases').insert({}); // empty promise

  var slicedData = caseData.slice(index, index + 1000);
  return knex('cases').insert(slicedData).then(function() {
    return populateTable(caseData, index + 1000);
  });
};

var close = function() {
  return knex.client.pool.destroy();
};

knex.schema.dropTableIfExists('cases')
  .then(createTable)
  .then(downloadCaseData)
  .then(parseCaseData)
  .then(populateTable)
  .then(close);