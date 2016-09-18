// Creates the reminders table.
var Knex = require('knex');
require('dotenv').config();

var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

var createTable = function() {
  return knex.schema.createTable('queued', function(table) {
    table.increments('queued_id').primary();
    table.dateTime('created_at');
    table.string('citation_id', 100);
    table.string('phone', 100);
    table.boolean('sent');
    table.boolean('asked_reminder');
    table.dateTime('asked_reminder_at')
  });
};

var close = function() {
  return knex.client.pool.destroy();
};

createTable()
  .then(close)
  .then(function() {
    console.log('Queued table created.');
    process.exit();
  });
