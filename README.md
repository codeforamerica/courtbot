[![Build Status](https://travis-ci.org/codeforanchorage/courtbot.svg?branch=master)](https://travis-ci.org/codeforanchorage/courtbot)
## Courtbot
Courtbot is a simple web service for handling court case data. It offers a basic HTTP endpoint for integration with websites, and a set of advanced twilio workflows to handle text-based lookup.

Specifically, the twilio features include:

- **Requests.** If a case requires a court appearance, the app allows users to sign up for reminders, served 24 hours in advance of the case.
- **Unmatched Cases.** If a case isn't in the system (usually because it takes two weeks for paper citations to be put into the computer), the app allows users to get information when it becomes available. The app continues checking each day for a number of days (set by config QUEUE_TTL_DAYS) and sends the case information when found (or an apology if not).

## Datamodel
The main features of the app use three tables in a Postgress Databases:
1. hearings | This table had the data about upcoming cases. It is recreated each time *runners/load.js* is exectued from the csv files found at urls set in config variable *DATA_URL*. It is ephemeral — it is recreated from scratch every day so the app must be prepared for cases that are there one day and not there the next. It is possible for the CSV to have duplicate rows. The load script enforces unique case_ids
2. requests | This table stores the requests for notifications. Each row requires a phone number, which is encrypted using config *PHONE_ENCRYPTION_KEY*, and a *case_id*.  The table also has columns *known_case* and *active*. *known_case* allows the app to distinguish between cases that we have seen *at some point* in the hearings table. Requests for cases where *known_case* is false will expire after *QUEUE_TTL_DAYS* and *active* will be set to false. If the case appears at anytime before that *known_case* will be set to true and the request will not expire unless a user manually turns if off with by texting DELETE after sending the case. The requests table uses the column *updated_at* to determine if an unmatched case has expired rather than *created_at*. These will generally be the same, but it allows for the future possibility of allowing unmatched cases to be extended.
3. notifications | Rows in the notifications table are added whenever the app send the user a notification. These can include notifications the day before a hearing or notifications that an unmatched cases was not found within QUEUE_TTL_DAYS. The table has columns for *case_id* and *phone_number* which link the case to the person recieving the notification. It also has the following columns:
   * *created_at* timestamp, which should correspond to the time the notification is sent
   * *event_date* the date of the hearing at the time the notification was sent. This may or may not be the date in current versions of the csv as this changes frequently.
   * *type* enumeration to distinguish between hearing notifications[reminder], matched[matched] cases, and expired cases that were not found within QUEUE_TTL_DAYS [expired]
   * *error* and error string if sending a notification failed (perhaps due to a twilio error or bad number).

See sendReminders.js and sendUnmatched.js for examples of SQL using these tables.

The database also has tables *log_hits* and *log_runners*. These log activity of the app.

## Running Locally

First, install [node](https://github.com/codeforamerica/howto/blob/master/Node.js.md), [postgres](https://github.com/codeforamerica/howto/blob/master/PostgreSQL.md).

Then clone the repository into a folder called courtbot:

```console
git clone git@github.com:codeforanchorage/courtbot.git courtbot
```

Since the app uses twilio to send text messages, it requires a bit of configuration. Get a [twilio account](http://www.twilio.com/), create a .env file by running `cp .env.sample .env`, and add your twilio authentication information. While you're there, add a cookie secret and an encryption key (long random strings).

Install node dependencies

```console
npm install
```

Create a new PostgreSQL database and a database to run tests.

```
createdb courtbotdb
createdb courtbotdb_test
```

Define a new PostgreSQL user account.

```
createuser courtbot
```

Then, to create the tables and load in initial data:

```console
node utils/createRequestsTable.js
node utils/createNotificationsTable.js
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
heroku addons:create rollbar:free (only add if you do NOT have another rollbar account you want to use)
heroku config:set COOKIE_SECRET=<random string>
heroku config:set ROLLBAR_ACCESS_TOKEN = <rollbar access token> (only needed if you did NOT use the heroku addon for rollbar)
heroku config:set ROLLBAR_ENDPOINT = <rollbar endpoint> (only needed if you did NOT use the heroku addon for rollbar)
heroku config:set TWILIO_ACCOUNT_SID=<twilio account>
heroku config:set TWILIO_AUTH_TOKEN=<twilio auth token>
heroku config:set TWILIO_PHONE_NUMBER=<twilio phone number>
heroku config:set PHONE_ENCRYPTION_KEY=<random string>
heroku config:set DATA_URL=<court records csv location>
heroku config:set COURT_PUBLIC_URL=<where to send people for more info>
heroku config:set COURT_NAME=<name of court system>
heroku config:set QUEUE_TTL_DAYS=<# days to keep a citation on the search queue>
heroku config:set TZ=<standard timezone ex. America/Anchorage>
heroku config:set TEST_TOMORROW_DATES=<1 if you want all court dates to be tomorrow to test reminders>
heroku config:set ADMIN_LOGIN=<user name for access to admin api>
heroku config:set ADMIN_PASSWORD=<password for access to admin api>
heroku config:set JWT_SECRET=<random string to be used to create json web token when authenticating admin api>
git push heroku master
heroku run node utils/createRequestsTable.js
heroku run node utils/createNotificationsTable.js
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
* node runners/sendUnmatched.js
* node runners/sendReminders.js

## Running Tests

Initialize the test database:

* node test_utils/reset

Set up your environment variables:

* cp .sample.env .env
-OR- set your own

The run the tests:

npm test
