## Courtbot

Courtbot is a simple web service for handling court case data. It offers a basic HTTP endpoint for integration with websites, and a set of advanced twilio workflows to handle text-based lookup.

Specifically, the twilio features include:

- **Payable Prompt.** If a case can be paid immediately, the app offers a phone number and link to begin payment.
- **Reminders.** If a case requires a court appearance, the app allows users to sign up for reminders, served 24 hours in advance of the case.
- **Queued Cases.** If a case isn't in the system (usually because it takes two weeks for paper citations to be put into the computer), the app allows users to get information when it becomes available. The app continues checking each day for up to 16 days and sends the case information when found (or an apology if not).

## Running Locally

First, install [node](https://github.com/codeforamerica/howto/blob/master/Node.js.md), [postgres](https://github.com/codeforamerica/howto/blob/master/PostgreSQL.md), and [foreman](https://github.com/ddollar/foreman).

Then, to create the tables and load in initial data:

```console
node utils/createQueuedTable.js
node utils/createRemindersTable.js
node loaddata.js
```

Since the app uses twilio to send text messages, it requires a bit of configuration. Get a [twilio account](http://www.twilio.com/), create a .env file by running `mv .env.sample .env`, and add your twilio authentication information. While you're there, add a cookie secret and an encryption key (long random strings).

To start the web service:

```console
foreman start
```

## Deploying to Heroku

First, get a twilio account and auth token as described above. Then:

```console
heroku create <app name>
heroku addons:add heroku-postgresql
heroku addons:add scheduler
heroku config:set COOKIE_SECRET=<random string>
heroku config:set TWILIO_ACCOUNT=<twilio account>
heroku config:set TWILIO_AUTH_TOKEN=<twilio auth token>
heroku config:set TWILIO_PHONE_NUMBER=<twilio phone number>
heroku config:set PHONE_ENCRYPTION_KEY=<random string>
git push heroku master
heroku run node utils/createQueuedTable.js
heroku run node utils/createRemindersTable.js
heroku run node utils/loaddata.js
heroku open
```

Finally, you'll want to setup scheduler to run the various tasks each day. Here's the recommended config:

![scheduler settings](https://cloud.githubusercontent.com/assets/1435836/4785655/2893dd9a-5d83-11e4-9618-d743bee27d2f.png)
