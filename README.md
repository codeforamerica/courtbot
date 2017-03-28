[![Build Status](https://travis-ci.org/codeforanchorage/courtbot.svg?branch=master)](https://travis-ci.org/codeforanchorage/courtbot)
## Courtbot
Courtbot is a simple web service for handling court case data. It offers a basic HTTP endpoint for integration with websites, and a set of advanced twilio workflows to handle text-based lookup.

Specifically, the twilio features include:

- **Reminders.** If a case requires a court appearance, the app allows users to sign up for reminders, served 24 hours in advance of the case.
- **Queued Cases.** If a case isn't in the system (usually because it takes two weeks for paper citations to be put into the computer), the app allows users to get information when it becomes available. The app continues checking each day for up to 16 days and sends the case information when found (or an apology if not).

## Running Locally

First, install [node](https://github.com/codeforamerica/howto/blob/master/Node.js.md), [postgres](https://github.com/codeforamerica/howto/blob/master/PostgreSQL.md).

Since the app uses twilio to send text messages, it requires a bit of configuration. Get a [twilio account](http://www.twilio.com/), create a .env file by running `cp .env.sample .env`, and add your twilio authentication information. While you're there, add a cookie secret and an encryption key (long random strings).

Install node dependencies

```console
npm install
```

Then, to create the tables and load in initial data:

```console
node utils/createQueuedTable.js
node utils/createRemindersTable.js
node runners/load.js
```

To start the web service:

```console
npm start
```

Now you can interact with a mock of the service at http://localhost:5000.

## Deploying to Heroku

First, get a twilio account and auth token as described above. Then:

```console
heroku create <app name>
heroku addons:add heroku-postgresql
heroku addons:add scheduler
heroku addons:create rollbar:free
heroku config:set COOKIE_SECRET=<random string>
heroku config:set TWILIO_ACCOUNT=<twilio account>
heroku config:set ROLLBAR_ACCESS_TOKEN = <rollbar access token>
heroku config:set ROLLBAR_ENDPOINT = <rollbar endpoint>
heroku config:set TWILIO_AUTH_TOKEN=<twilio auth token>
heroku config:set TWILIO_PHONE_NUMBER=<twilio phone number>
heroku config:set PHONE_ENCRYPTION_KEY=<random string>
heroku config:set DATA_URL=<court records csv location>
heroku config:set COURT_PUBLIC_URL=<where to send people for more info>
heroku config:set QUEUE_TTL_DAYS=<# days to keep a citation on the search queue>
heroku config:set TIMEZONE=<standard timezone ex. America/Anchorage>
heroku config:set TEST_TOMORROW_DATES=<1 if you want all court dates to be tomorrow to test reminders>
git push heroku master
heroku run node utils/createQueuedTable.js
heroku run node utils/createRemindersTable.js
heroku run node runners/load.js
heroku open
```

The dotenv module will try and load a .env file to get the environment variables as an alternative to the above "heroku config" commands.
If you don't have this file, dotenv will throw an ENOENT error, but things will still work. To get rid of this error, do this:
```
heroku run bash --app <APP_NAME>
touch .env
exit
```


Finally, you'll want to setup scheduler to run the various tasks each day. Here's the recommended config:

![scheduler settings](https://cloud.githubusercontent.com/assets/1435836/4785655/2893dd9a-5d83-11e4-9618-d743bee27d2f.png)

## Scheduler Changes
* node runners/load.js
* node runners/sendQueued.js
* node runners/sendReminders.js

## Running Tests

Initialize the test database:

* node test_utils/reset

Set up your environment variables:

* cp .sample.env .env
-OR- set your own

The run the tests:

npm test
