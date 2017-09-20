/* eslint "no-console": "off" */

// Downloads the latest courtdate CSV file and
// rebuilds the database. For best results, load nightly.

const request = require('request');
const parse = require('csv-parse');
const sha1 = require('sha1');
const dates = require('./dates');
require('dotenv').config();
const manager = require('./db/manager');
const moment = require('moment-timezone');

const CSV_DELIMITER = ',';

/**
 * fetch the data from the url, parse it and extract it
 *
 * @param  {String} url - url of the court data
 * @param  {String} extractionHandler - function to use to extract the case data
 *    from the rows once they are parsed from the CSV file
 * @return {Promise} ({Array} cases) - cases derived from data
 */
function getCases(url, extractionHandler) {
  // get the basename of the file for logging
  const file = url.split('/').reverse()[0];

  return new Promise((resolve, reject) => {
    console.log(`Downloading CSV file ${file}...`);
    request.get(url, (req, res) => {
      if (res.statusCode === 404) {
        console.log(`404 page not found ${url}`);
        return reject(Error(`404 page not found ${url}`));
      }

      console.log(`Parsing CSV file ${file}...`);
      return parse(res.body, { delimiter: CSV_DELIMITER }, (err, rows) => {
        if (err) {
          console.log(`Unable to parse file: ${url}`);
          console.log(err);
          return reject(err);
        }

        console.log(`  extracting information from ${rows.length} rows from ${file}...`);
        const cases = extractionHandler(rows);
        console.log(`  produced ${cases.length} case records from ${file}...`);
        return resolve(cases);
      });
    });
  });
}

/**
 *  extract criminal cases from criminal court hearing rows parsed from the CSV file
 *
 * Criminal cases have a case number instead of a citation number, and may have multiple
 *  hearing types possibly on different days or in different locations.  So instead of
 *  condensing the records as the extractCourtData method does, we are going to keep it
 *  as-is, but skip full duplicate rows.
 *
 * @param  {Array} rows - criminal court hearing records
 * @return {Array} cases - cases derived from citation data
 */
function extractCriminalCases(rows) {
  const cases = [];
  const casesMap = {};
  rows.forEach((c) => {
    const newHearing = {
      id: c[5],
      description: c[6],
      location: c[5].substr(0, 3),
    };

    let hearingDate = c[0];
    // If we want to test reminders, set all dates to tomorrow
    if (process.env.TEST_TOMORROW_DATES === '1') {
      const before = c[0];
      hearingDate = moment().add(1, 'days').format('MM/DD/YYYY');
      console.log(`Before: ${before}, After: ${hearingDate}`);
    }

    const newCase = {
      date: dates.fromDateAndTime(hearingDate, c[4]),
      defendant: `${c[2]} ${c[1]}`,
      room: c[3],
      time: c[4],
      citations: [newHearing],
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
 *  3. Cases that use identical citation numbers. Typos when put into the system.
 *
 * @param  {Array} rows - Citation records
 * @return {Array} cases - Cases derived from citation data
 */
function extractCourtData(rows) {
  const cases = [];
  const casesMap = {};
  const citationsMap = {};

  rows.forEach((c) => {
    const citationInfo = c[8].split(':');
    const newCitation = {
      id: c[6],
      violation: citationInfo[0],
      description: citationInfo[1],
      location: c[6].substr(0, 3),
    };

    let hearingDate = c[0];
    // If we want to test reminders, set all dates to tomorrow
    if (process.env.TEST_TOMORROW_DATES === '1') {
      const before = c[0];
      hearingDate = moment().add(1, 'days').format('MM/DD/YYYY');
      console.log(`Before: ${before}, After: ${hearingDate}`);
    }

    const newCase = {
      date: dates.fromDateAndTime(hearingDate, c[5]),
      defendant: `${c[2]} ${c[1]}`,
      room: c[4],
      time: c[5],
      citations: [],
    };

    // Since no values here are actually unique, we create some lookups
    const citationLookup = newCitation.id + newCitation.violation;
    newCase.id = sha1(newCase.defendant + newCitation.location.slice(0, 3));
    const caseLookup = newCase.id;

    // The checks below handle the multiple citations in the dataset issue.
    // See above for a more detailed explanation.
    const prevCitation = citationsMap[citationLookup];
    const prevCase = casesMap[caseLookup];

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
}

/**
 * inserts cases into the cases table in the database, 1000 at a time
 *
 * @param  {Array} cases - array of cases to store
 * @return {Promise} - void
 */
function insertCases(cases) {
  // Make violations a JSON blob, to keep things simple
  cases.forEach((c) => {
    c.citations = JSON.stringify(c.citations); /* eslint "no-param-reassign": "off" */
  });

  return manager.batchInsert('cases', cases, 1000);
}

/**
 * store cases in the database
 *
 * Note: this drops and recreates the table (which also creates and index) then
 *   inserts the data, according to (https://www.postgresql.org/docs/9.2/static/populate.html)
 *   this may be slower than inserting bulk data before creating a new index.
 *   But, this is much cleaner.
 *
 * @param  {Array} cases - array of cases to store
 * @return {Promise}
 */
function persistCases(cases) {
  return manager.dropTable('cases')
    .then(() => manager.createTable('cases'))
    .then(() => insertCases(cases))
    .then(manager.closeConnection);
}

/**
 * Main function that performs the entire load process.
 *
 * @param  {String} dataUrls - list of data urls to load along with an optional
 *   extractor to use on each file.  Format is url|extractor,...  The default
 *   extractor is extractCourtData.  If this parameter is missing, then the
 *   environment variable DATA_URL is used instead.
 * @return {Promise} - true
 */
function loadData(dataUrls) {
  // determine what urls to load and how to extract them
  // example DATA_URL=http://courtrecords.alaska.gov/MAJIC/sandbox/acs_mo_event.csv
  // example DATA_URL=http://courtrecords.../acs_mo_event.csv|extractCourtData,http://courtrecords.../acs_cr_event.csv|extractCriminalCases
  const files = (dataUrls || process.env.DATA_URL).split(',');
  // queue each file and extraction as a promise
  const queue = [];
  files.forEach((item) => {
    const [url, extractor] = item.split('|');
    if (url.trim() !== '') {
      // use the specified extractor name to determine which extraction method to use
      // default to the original extraction method
      if (extractor) {
        queue.push(getCases(url, (extractor === 'extractCriminalCases' ? extractCriminalCases : extractCourtData)));
      } else {
        queue.push(getCases(url, extractCourtData));
      }
    }
  });

  return Promise.all(queue)
    .then(results => [].concat.apply([], results))
    .then(cases => persistCases(cases))
    .then(() => {
      console.log('Data loaded! All systems are go.');
      return true;
    });
}

// Do the thing!

module.exports = loadData;
