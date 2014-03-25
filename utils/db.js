var Knex = require('knex');
var Promise = require('bluebird');

var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

exports.recreateDB = function(data, callback) {
  var insertAll = function() {
    return Promise.all(data.map(function(cases) {
      return knex('cases').insert(cases);
    }));
  };

  knex.schema.dropTableIfExists('cases')
    .then(createTable)
    .then(insertAll)
    .then(close)
    .then(function() {
      callback();
    });
};

var createTable = function() {
  return knex.schema.createTable('cases', function(t) {
    t.increments('id').primary();
    t.string('defendant', 100);
    t.string('room', 100);
    t.string('date', 100);
    t.string('time', 100);
    t.string('citation', 100);
    t.string('violation_code', 100);
    t.string('violation_desc', 100);
  });
}

var close = function() {
  return knex.client.pool.destroy();
};

