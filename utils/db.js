var Knex = require('knex');
var Promise = require('bluebird');

var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

exports.recreateDB = function(data, callback) {
  var insertAll = function() {
    return Promise.all(data.map(function(cases) {
      // Make violations a JSON blob, to keep things simple
      cases.forEach(function(c) { c.violations = JSON.stringify(c.violations); })
      return knex('cases').insert(cases);
    }));
  };

  knex.schema.dropTableIfExists('cases')
    .then(createCasesTable)
    .then(insertAll)
    .then(close)
    .then(function() {
      callback();
    });
};

var createCasesTable = function() {
  return knex.schema.createTable('cases', function(table) {
    table.increments('id').primary();
    table.string('citation', 100);
    table.string('defendant', 100);
    table.date('date');
    table.string('time', 100);
    table.string('room', 100);
    table.json('violations');
  });
}

var close = function() {
  return knex.client.pool.destroy();
};

