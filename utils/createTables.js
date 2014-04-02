// Creates the reminders table.

var Knex = require('knex');

var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

var createTable = function() {
  return knex.schema.createTable('reminders', function(table) {
    table.increments('id').primary();
    table.string('citation', 100);
    table.string('phone', 100);
    table.string('date', 100);
    table.boolean('sent', 100);
  });
};

var close = function() {
  return knex.client.pool.destroy();
};

createTable()
  .then(close)
  .then(function() {
    console.log('Tables created.')
  });
