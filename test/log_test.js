'use strict';
require('dotenv').config();
const sendUnmatched = require("../sendUnmatched.js").sendUnmatched;
const expect = require("chai").expect;
const assert = require("chai").assert;
const moment = require("moment-timezone")
const manager = require("../utils/db/manager");
const db = require('../db');
const knex = manager.knex;
const sinon = require('sinon')
const messages = require('../utils/messages')
const app = require('../web');
const session = require('supertest-session');
const Rollbar = require('rollbar');
const log = require('../utils/logger')


describe("Endpoint requests", function(){
    let sess;
    const params = { Body: "A4928456", From: "+12223334444"  };

    beforeEach(function() {
        sess = session(app);
        return knex('log_hits').del()
    })
    afterEach(function(){
        sess.destroy();
    })
    it("should create row in log_hits table", function(done){
        sess.post('/sms').send(params)
        .expect(200)
        .end(function (err, res) {
            if (err) return done(err);
            setTimeout(() =>{ // fix this once new winston event emitters are working
                knex('log_hits').select('*')
                .then(rows => {
                    expect(rows.length).to.equal(1)
                    expect(rows[0].phone).to.equal(db.encryptPhone(params.From))
                    expect(rows[0].body).to.equal(params.Body)
                    expect(rows[0].action).to.equal('unmatched_case')
                    expect(rows[0].path).to.equal('/sms')
                })
                .then(done)
                .catch(done)
            }, 200)

        });
    })
    it("should create a row with error status for non-200 responses", function(done){
        const bad_path = '/sms0jhkjhkjhdfsf090mfl'
        sess.get(bad_path)
        .expect(404)
        .end(function (err, res) {
            if (err) return done(err);
            setTimeout(() =>{ // fix this once new winston event emitters are working
                knex('log_hits').select('*')
                .then(rows => {
                    expect(rows.length).to.equal(1)
                    expect(rows[0].status_code).to.equal('404')
                    expect(rows[0].path).to.equal(bad_path)
                    expect(rows[0].action).to.be.null
                })
                .then(done)
                .catch(done)
            }, 200)
        });
    })
})

describe("Error level logs", function(){
    it('should be sent to Rollbar', function(){
        const rollbarStub = sinon.stub(Rollbar.prototype, "error")
        const err = new Error("whoops")
        log.error(err)
        sinon.assert.calledOnce(rollbarStub)
        sinon.assert.calledWith(rollbarStub, err)
    } )
})