// Downloads 30 days of case data in PDF form,
// parses it, and populate the pg database. Blows
// away any existing data.

var db = require('./db.js');
var scraper = require('./scraper.js');

var DAYS = 30;

console.log('Scraping case data...');
scraper.getCourtCases(DAYS, function(err, data) {
  console.log('Recreating the database...');
  db.recreateDB(data, function(err, data) {
    console.log('Database recreated...');
  });
});