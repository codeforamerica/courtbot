// Scrapes the data from the Atlanta Municipal Court website
// and transforms it into an array.

var fs = require('fs');
var http = require('http');
var async = require('async');
var moment = require('moment');
var parse = require('csv-parse');
var pdf2csv = require('./pdf2csv.js');

exports.getCourtCases = function(days, callback) {
  var dates = [];
  for (var i = 0; i < days; i++) {
    dates.push(moment().add('days', i));
  }

  console.log('Generating URLs...');
  var urls = dates.map(generateURL);
  
  console.log('Downloading PDFs...');
  async.map(urls, download, function(err, pdfs) {
    console.log('Converting PDFs to CSVs...');
    async.map(pdfs, pdf2csv.convert, function(err, csvs) {
      console.log('Extracting case data from CSVs...');
      async.map(csvs, parseCSV, function(err, cases) {
        callback(undefined, cases);
      });
    });
  });
};

var generateURL = function(date) {
  return 'http://courtview.atlantaga.gov/courtcalendars/D' + date.format('YYMMDD') + '.pdf';
};

var download = function(url, callback) {
  var tokens = url.split("/");
  var filename = tokens[tokens.length - 1];
  var path = __dirname + '/tmp/' + filename;

  var file = fs.createWriteStream(path);
  var request = http.get(url, function(response) {
    response.pipe(file);
    file.on('finish', function() {
      file.close();
      if (response.statusCode === 404) return callback(undefined, false);
      return callback(undefined, path);
    });
  });
};

var parseCSV = function(csv, callback) {
  if (!csv) return callback(undefined, []);

  fs.readFile(csv, function(err, data) {
    if (err) return callback(undefined, []);
    parse(data, {delimiter: ',', escape: '"'}, function(err, rows) {
      var cases = extractCases(rows);
      return callback(undefined, cases);
    });
  });
};

var extractCases = function(data) {
  var cases = [];
  var casesMap = {};

  var prevLine = false;
  var date = moment(data[1][0]).toDate();

  data.forEach(function(line) {
    if (prevLine) {
      line = prevLine.concat(line);
      prevLine = false;
    }

    // Short lines are usually parser errors and should be ignored
    if (line.length < 4) return;

    // If we have only 5 fields, the case is missing a court room. 
    // Skip these fields for the moment, not sure how to handle it.
    if (line.length === 5) return;

    // Ignore the lines that are just table headers
    if (line[0] === 'Defendant') return;

    // If we've got 4 values, but not 5, the parser has accidently wrapped.
    // Saved the data and use it for the next line
    if (!line[4]) {
      prevLine = line;
      return;
    }

    var citation = parseCitation(line[5]);

    // Add the case if we haven't seen it before
    if (!casesMap[citation]) {
      var caseData = {
        defendant: line[4].trim(),
        room: line[0],
        date: date,
        time: line[1].trim(),
        citation: citation,
        violations: [],
      };

      casesMap[citation] = caseData;
      cases.push(caseData);
    }

    casesMap[citation].violations.push({
      code: line[2],
      description: line[3],
    });
  });

  return cases;
};

var parseCitation = function(citation) {
  // Remove the 'THE CITY OF ATLANTA MUNICIPAL COURT' string
  // that sometimes gets mixed in because of the broken parser
  var hasJunk = citation.indexOf("THE CITY OF ATLANTA MUNICIPAL COURT");
  if (hasJunk > -1) citation = citation.substring(0, hasJunk);

  return citation;
};