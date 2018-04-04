require('dotenv').config();
const express = require('express')
const router = express.Router()
const db = require('./db')
const moment = require('moment-timezone')
const jwt = require("jsonwebtoken");

/**
 * Test whether user/password is valid
 * @param {String} user
 * @param {String} password
 * @returns {Boolean} is user/password valid
 */
function authorized(user, password){
    // just a stub for now using .env values
    // TODO flesh out with better user management
    if (user == process.env.ADMIN_LOGIN && password == process.env.ADMIN_PASSWORD) {
        return true
    }
    else { return false }
}

/**
 * Middleware that checks JWT in auth header is valid. If it is it will call next() to allow request to proceed
 * otherwise sends 401.
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function requireAuth(req, res, next){
    if (req.headers && req.headers.authorization && req.headers.authorization.split(' ')[0] == 'JWT'){
        jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET, function(err, decoded){
            if (err) {
                res.status(401).json({message: "Authorization Required"})
            }
            else {
                next()
            }
        })
    }
    else {
        res.status(401).json({message: "Authorization Required"})
    }
}

router.post('/admin_login', function(req, res, next){
    if(authorized(req.body.user, req.body.password)) {
        res.json(({token: jwt.sign({user: req.body.user}, process.env.JWT_SECRET)}))
    }
    else{
        res.status(401).json({message: "Login Failed"})
    }
})


/**
 * Get info form case_id
 */
router.get('/case', requireAuth, function(req, res, next){
    if (!req.query || !req.query.case_id) return res.sendStatus(400);
    db.findHearing(req.query.case_id)
    .then(data => {
        res.send(data);
    })
    .catch(err => next(err))
})

/**
 * Returns requests associated with case_id. If
 * there are notifications associated with request the will be
 * included in a notifcations list
 * @param {String} case_id
 * @returns:
 * [{case_id:string, phone:string, created_at:date_string, active:boolean, noficiations:[]}]
 */
router.get('/requests', requireAuth, function(req, res, next){
    if (!req.query || !req.query.case_id) return res.sendStatus(400);
    db.findRequestNotifications(req.query.case_id)
    .then(data => {
        if (data) {
            data.forEach(function (d) {
                // Replace postgres' [null] with [] is much nicer on the front end
                d.notifications = d.notifications.filter(n => n)
            });
        }
        res.send(data);
    })
    .catch(err => next(err))
})

/**
 * Returns requests associated with phone. If
 * there are notifications associated with request the will be
 * included in a notifcations list
 * @param {String} encrypted phone
 * @returns
 * [{case_id:string, phone:string, created_at:timestamp, active:boolean, noficiations:[]}]
 */
router.get('/requests_by_phone', requireAuth, function(req, res, next){
    if (!req.query || !req.query.phone) return res.sendStatus(400);
    db.findRequestsFromPhone(req.query.phone)
    .then(data => {
        if (data) {
            data.forEach(function (d) {
                // Replace postgres' [null] with [] is much nicer on the front end
                d.notifications = d.notifications.filter(n => n)
            });
        }
        res.send(data);
    })
    .catch(err => next(err))
})

/**
 * Returns all logged activity for an (encrypted) phone number
 * @param {string} encrypted phon
 * @return [{time: timstamp, path:/sms, method:POST, status_code:200, phone:encryptedPhone, body:'user input', action:action}]
 */
router.get('/phonelog', requireAuth, function(req, res, next){
    if (!req.query || !req.query.phone) return res.sendStatus(400);
    db.phoneLog(req.query.phone)
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * Histogram of actions within timeframe
 * @param {Number} daysback [default 7]
 * @returns [{type:action type, count: number}]
 */
router.get('/action_counts', requireAuth, function(req, res, next){
    db.actionCounts(req.query.daysback)
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * Histogram of notifications sent by type
 * @param {Number} daysback [default 7]
 * @returns [{type:notification type, count: number}]
 */
router.get('/notification_counts', requireAuth,  function(req, res, next){
    db.notificationCounts(req.query.daysback)
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * Notifications with errors
 * @param {Number} daysback [default 7]
 * @returns [{type:notification type, count: number}]
 */
router.get('/notification_errors', requireAuth, function(req, res, next){
    db.notificationErrors(req.query.daysback)
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * Histogram of action counts grouped by type and then by date
 * @param {Number} daysback [default 30]
 * @returns [{day: timestamp, actions:[{type: action number, count:number}]}]
 */
router.get('/actions_by_day', requireAuth, function(req, res, next){
    db.actionsByDay(req.query.daysback)
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * Dates of the last run of each Runner script
 * @returns [{runner: runner name, date: timestamp}]
 */
router.get('/runner_last_run', requireAuth, function(req, res, next){
    db.notificationRunnerLog()
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * The current number of distinct cases for which there are requests
 * and the number of distinct phone numbers watching cases
 * @returns[{phone_count: number, case_count: number}]
 */
/* returns a simple object with counts: { scheduled: '3', sent: '10', all: '3' } */
router.get('/request_counts', requireAuth, function(req, res, next){
    db.requestCounts()
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * All notifications sent within daysback days grouped by type
 * @param {Number} daysback
 * @returns [{type:notification type, notices:[{phone:encrypted phone, case_id: id, created_at: timestamp when sent, event_date: hearing date}]}]
 */
router.get('/notifications', requireAuth, function(req, res, next){
    db.recentNotifications(req.query.daysback)
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * All notifications sent within daysback days grouped by type
 * @param {Number} daysback
 * @returns [{type:notification type, notices:[{phone:encrypted phone, case_id: id, created_at: timestamp when sent, event_date: hearing date}]}]
 */
router.get('/notifications_by_day', requireAuth, function(req, res, next){
    db.recentNotificationsByDay(req.query.daysback)
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * The number of hearings in the DB and date of last load runner
 * @returns [{id: log id, runner: load, count: number, error_count: number, date: runner timestamp }]
 */
/* returns a simple object with counts: { count: '3' } */
router.get('/hearing_counts', requireAuth, function(req, res, next){
    db.hearingCount()
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * User input that we couldn't understand
 * @returns [{body:phrase, count: number }]
 */
router.get('/unusable_input', requireAuth, function(req, res, next){
    db.unusableInput(req.query.daysback)
    .then(data => res.send(data))
    .catch(err => next(err))
})

/**
 * Notifications that recieved errors when sending
 * @returns [{body:phrase, count: number }]
 */
router.get('/notification_errors', requireAuth, function(req, res, next){
    db.notificationErrors(req.query.daysback)
    .then(data => res.send(data))
    .catch(err => next(err))
})

module.exports = router;