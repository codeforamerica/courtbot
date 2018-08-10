'use strict';
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
const fs = require('fs');
const url = require('url');
const manager = require('../utils/db/manager');
const loadData = require('../utils/loaddata');

const knex = manager.knex;
const MOCKED_DATA_URL = 'http://courtrecords.alaska.gov/MAJIC/sandbox/acs_mo_event.csv|civil_cases,http://courtrecords.alaska.gov/MAJIC/sandbox/acs_cr_event.csv|criminal_cases';
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
    beforeEach(function() {
        return manager.ensureTablesExist()
        .then(() => knex("hearings").del())
    });

    describe('With a 404 on the CSV', function () {
        beforeEach(function(){
            dataUrls.forEach((dataUrl) => {
                nock(dataHostname(dataUrl))
                 .get(dataPath(dataUrl))
                 .reply(404);
             });
        })
        afterEach(nock.cleanAll)

        it('hits the error callback with a 404 message', function () {
            return loadData(MOCKED_DATA_URL).then(assert.failed, (err) => {
                console.log("error: ", err.message)
                expect(err.message).to.include('HTTP Status: 404');
            });
        });

        it('leaves current hearings table intact', function(){
            return knex('hearings').insert({date: '2017-01-01', room: 'test room', case_id: '112233', defendant:'Jane Doe'})
            .then(() => loadData(MOCKED_DATA_URL))
            .then(assert.failed, () => knex('hearings').select('*'))
            .then(rows => {
                expect(rows.length).to.equal(1)
            })
        })

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
            .then(resp => expect(resp).to.deep.equal({files: 2, records: 55}));
        });

    it('creates 55 cases', function () {
      // 38 lines, two sets of duplicates in first file
      // 20 lines, one set of duplicates in second file
      return loadData(MOCKED_DATA_URL)
        .then(() => knex('hearings').count('* as count'))
        .then(rows => expect(rows[0].count).to.equal('55'));
    });

    it('properly manages a single defendant', function () {
      return loadData(MOCKED_DATA_URL)
        .then(() => knex('hearings').where({ defendant: 'Christopher Dunlap' }))
        .then((rows) => {
          expect(rows[0].defendant).to.equal('Christopher Dunlap');
          expect(rows[0].room).to.equal('Petersburg Courthouse');
          expect(rows[0].case_id).to.equal('PEFEP00391416');
        });
    });

    it('properly manages a multiple hearings on same day for same case ID', function () {
      return loadData(MOCKED_DATA_URL)
        .then(() => knex('hearings').where({ case_id: 'KETZP00410583' }))
        .then((rows) => {
          expect(rows.length).to.equal(2)
          expect(rows[0].defendant).to.equal('Jacob Lewis');
          expect(rows[1].defendant).to.equal('Jacob Lewis');
          expect(rows[0].room).to.equal('Ketchikan Courthouse');
        });
    });

    it('properly manages a criminal case', function () {
      return loadData(MOCKED_DATA_URL)
        .then(() => knex('hearings').where({ defendant: 'Tyler Totland' }))
        .then((rows) => {
          for (let i = 0; i < 2; i++) {
            expect(rows[i].defendant).to.equal('Tyler Totland');
            expect(rows[i].room).to.equal('Courtroom A, Haines Courthouse');
            expect(rows[i].case_id).to.equal('1HA-17-00029CR');
          }
          // hearing types differ
          expect(rows[0].type).to.not.equal(rows[1].type);
        });
    });
  });
});
