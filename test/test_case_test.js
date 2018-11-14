'use strict';
const expect = require("chai").expect;
const manager = require("../utils/db/manager");
const knex = manager.knex;
const db = require('../db');
const moment = require('moment-timezone')
const {deleteTestRequests,incrementTestCaseDate,addTestCase} = require('../utils/testCase.js')

const test_case_date = moment(11, 'HH').tz(process.env.TZ).add(1, 'days')

describe("A test case", function() {
    let a_case, a_request, test_request
    beforeEach(function () {   
        a_case = {
            //date: '27-MAR-15',
            date: moment(14, 'HH').tz(process.env.TZ).add(1, 'days'), // 2:00pm tomorrow,
            defendant: 'FREDERICK T TURNER',
            room: 'CNVCRT',
            case_id: "4928456"
        }
        a_request = {
            phone: "+12223334444",
            case_id: a_case.case_id,
            known_case: true
        }
        test_request = {
            phone: "+12223335555",
            case_id: process.env['TEST_CASE_NUMBER'],
            known_case: true
        }
             
        return manager.ensureTablesExist()
             .then(() => knex("hearings").del())
             .then(() => knex("requests").del())
             .then(() => knex("notifications").del())
             .then(() => knex("hearings").insert(a_case))
             .then(() => db.addRequest(a_request))
             .then(() => db.addRequest(test_request))
     })

    it("should be added to the hearings table", function(){
        return addTestCase()
        .then(() => knex('hearings').where({ case_id: process.env['TEST_CASE_NUMBER'] }))
        .then((rows) => {
          expect(rows.length).to.equal(1)
        })
    })
    it("should not effect other hearings", function(){
        return addTestCase()
        .then(() => knex('hearings').where({ case_id: a_case.case_id }))
        .then((rows) => {
          expect(rows.length).to.equal(1)
          expect(rows[0].defendant).to.equal(a_case.defendant)
        })
    })
    it("should set a hearing for tomorrow at 11 am", function(){
        return addTestCase()
        .then(() => knex('hearings').where({ case_id: process.env['TEST_CASE_NUMBER'] }))
        .then((rows) => {
          expect(rows[0].date).to.equal(test_case_date.format())
        })
    })
    it("incrementTestCaseDate should add  one day to the existing test case ", function(){
        return addTestCase()
        .then(incrementTestCaseDate)
        .then(() => knex('hearings').where({ case_id: process.env['TEST_CASE_NUMBER'] }))
        .then((rows) => {
          expect(rows[0].date).to.equal(test_case_date.add(1, 'days').format())
        })
    })
    it("deleteTestRequests should remove test requests", function(){
        return addTestCase()
        .then(deleteTestRequests)
        .then(() => knex('requests').where({case_id: process.env['TEST_CASE_NUMBER'] }))
        .then((rows) => {
            expect(rows.length).to.equal(0)
        })
    })
    it("deleteTestRequests should ONLY remove test requests", function(){
        return addTestCase()
        .then(deleteTestRequests)
        .then(() => knex('requests').where({case_id: a_case.case_id }))
        .then((rows) => {
            expect(rows.length).to.equal(1)
        })
    })
})