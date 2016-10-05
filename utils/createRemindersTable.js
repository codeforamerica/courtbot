// Creates the reminders table.
require('dotenv').config();

var knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

var createTable = function() {
  return knex.schema.createTable('reminders', function(table) {
    table.increments('reminder_id').primary();
    table.dateTime('created_at');
    table.string('case_id', 100);
    table.string('phone', 100);
    table.boolean('sent', 100);
    table.json('original_case');
  });
};

var close = function() {
  return knex.client.pool.destroy();
};

createTable()
  .then(close)
  .then(function() {
    console.log('Reminders table created.');
    process.exit();
  });
