/* eslint "no-console": "off" */

// see https://mochajs.org/#arrow-functions
/* eslint-env mocha */
/* eslint arrow-body-style: ["warn", "as-needed"] */
/* eslint func-names: "off" */
/* eslint prefer-arrow-callback: "off" */

require('dotenv').config();
const expect = require('chai').expect;
const assert = require('chai').assert;
const nock = require('nock');
const tk = require('timekeeper');
const fs = require('fs');
const url = require('url');
const manager = require('../utils/db/manager');
const loadData = require('../utils/loaddata');

const knex = manager.knex;
const MOCKED_DATA_URL = 'http://courtrecords.alaska.gov/MAJIC/sandbox/acs_mo_event.csv|extractCourtData,http://courtrecords.alaska.gov/MAJIC/sandbox/acs_cr_event.csv|extractCriminalCases';
const dataUrls = MOCKED_DATA_URL.split(',');

function dataHostname(dataUrl) {
  return `http://${url.parse(dataUrl.split('|')[0]).hostname}`;
}

function dataPath(dataUrl) {
  return url.parse(dataUrl.split('|')[0]).pathname;
}

dataUrls.forEach((dataUrl) => {
  console.log('Host: ', dataHostname(dataUrl), 'Path: ', dataPath(dataUrl));
});

describe('Loading of Data', function () {
  beforeEach(() => {
    const time = new Date('2016-03-01T12:00:00'); // Freeze
    tk.freeze(time);
  });

  afterEach(function () {
    tk.reset();
  });

  describe('With a 404 on the CSV', function () {
    dataUrls.forEach((dataUrl) => {
      nock(dataHostname(dataUrl))
        .get(dataPath(dataUrl))
        .reply(404);
    });

    it('hits the error callback with a 404 message', function () {
      return loadData(MOCKED_DATA_URL).then(assert.failed, (err) => {
        expect(err.message).to.include('404 page not found');
      });
    });
  });

  describe('With a 200 on the CSV', function () {
    beforeEach(() => {
      dataUrls.forEach((dataUrl) => {
        const path = dataPath(dataUrl);
        nock(dataHostname(dataUrl))
          .get(path)
          .reply(200, () => fs.createReadStream(`test/fixtures/${path.split('/').reverse()[0]}`));
      });
    });

    it('hits the success callback correctly', function () {
      return loadData(MOCKED_DATA_URL)
        .then(resp => expect(resp).to.equal(true));
    });

    it('creates 55 cases', function () {
      // 38 lines, two sets of duplicates in first file
      // 20 lines, one set of duplicates in second file
      return loadData(MOCKED_DATA_URL)
        .then(() => knex('cases').count('* as count'))
        .then(rows => expect(rows[0].count).to.equal('55'));
    });

    it('properly manages a single defendant', function () {
      return loadData(MOCKED_DATA_URL)
        .then(() => knex('cases').where({ defendant: 'Christopher Dunlap' }))
        .then((rows) => {
          expect(rows[0].defendant).to.equal('Christopher Dunlap');
          expect(rows[0].room).to.equal('Petersburg Courthouse');
          expect(rows[0].citations.length).to.equal(1);
          expect(rows[0].citations[0].id).to.equal('PEFEP00391416');
        });
    });

    it('properly manages a duplicate defendant', function () {
      return loadData(MOCKED_DATA_URL)
        .then(() => knex('cases').where({ defendant: 'Michael Guthrie' }))
        .then((rows) => {
          expect(rows[0].defendant).to.equal('Michael Guthrie');
          expect(rows[0].room).to.equal('Ketchikan Courthouse');
          expect(rows[0].citations.length).to.equal(2);
          expect(rows[0].citations[0].id).to.equal('KETEE000003760305');
          expect(rows[0].citations[1].id).to.equal('KETEE000003760307');
        });
    });

    it('properly manages a criminal case', function () {
      return loadData(MOCKED_DATA_URL)
        .then(() => knex('cases').where({ defendant: 'Tyler Totland' }))
        .then((rows) => {
          for (let i = 0; i < 2; i++) {
            expect(rows[i].defendant).to.equal('Tyler Totland');
            expect(rows[i].room).to.equal('Courtroom A, Haines Courthouse');
            expect(rows[i].citations.length).to.equal(1);
            expect(rows[i].citations[0].id).to.equal('1HA-17-00029CR');
          }
          // hearing types differ
          expect(rows[0].citations[0].description).to.not.equal(rows[1].citations[0].description);
        });
    });
  });
});
