const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize } = format;
const Transport = require('winston-transport');
const crypto = require('crypto');
const action_symbol = Symbol.for('action');
const Rollbar = require('rollbar');
const winston = require('winston');
const {knex} = require("../db/manager");

const rollbar = new Rollbar({
    accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
    captureUncaught: false,
    captureUnhandledRejections: false
});

/* Log transport to write logs to database table */
class hit_table extends Transport {
    constructor(opts) {
      super(opts);
    }
    log(info, callback) {
        setImmediate(() => {
            this.emit('logged', "hit");
        });

        const cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
        const phone = info.req.body && info.req.body.From ? cipher.update(info.req.body.From, 'utf8', 'hex') + cipher.final('hex') : undefined
        return knex('log_hits').insert({
             path: info.req.url,
             method: info.req.method,
             status_code: info.statusCode,
             phone: phone,
             body: info.req.body && info.req.body.Body,
             action: info[action_symbol]
        })
        .then((res) => callback())
        .catch((err) => rollbar.error(err))
    }
  };

const config = {
    levels: { hit: 0 },
    colors: {hit: 'green'}
};

winston.addColors(config);

const myFormat = printf(info => `${info.level}: ${info.timestamp} ${info.message}`.replace(/undefined/g, ''));

const logger = createLogger({
    levels: config.levels,
    level: 'hit',
    format: combine(
        timestamp(),
        myFormat,
        colorize(),
      ),
    transports: [
        new transports.Console({
            format: combine(myFormat)
        }),
        new hit_table()
    ]
})

logger.on('error', function (err) {rollbar.error(err)});

/**
 * Basic log for incoming sms and web requests
 * This function is called by 'on-headers' module in web.js, which
 * sets the value of 'this' to the Express response object
 */
function log() {
    logger.hit(`${this.req.url} ${this.statusCode} ${this.req.method} ${this.req.body.From} ${this.req.body.Body}  ${this[action_symbol]}`, this)
}

module.exports = log

