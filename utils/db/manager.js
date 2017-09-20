/* eslint no-console: "off" */

require('dotenv').config();
const dates = require('../dates');
const db_connections = require('./db_connections'); /* eslint camelcase: "off" */
const knex = require('knex')(db_connections[process.env.NODE_ENV || 'development']);

const TIMESTAMPTZ_OID = 1184;
require('pg').types.setTypeParser(TIMESTAMPTZ_OID, dates.isoToUtc);

/**
 * 1.) Create indexing function for cases table using this strategy: http://stackoverflow.com/a/18405706
 * 2.) Drop and recreate index for cases table.
 *
 * @return {Promise} Promise to create indexing function for and index for cases table.
 */
function createIndexForCases() {
  return knex.raw('DROP INDEX IF EXISTS citation_ids_gin_idx')
    .then(() => knex.raw('CREATE INDEX citation_ids_gin_idx ON cases USING GIN (citations jsonb_path_ops)'));
}

/**
 * Set of instructions for creating tables needed by the courtbot application.
 *
 * @type {Object}
 */
const createTableInstructions = {
  cases() {
    return knex.schema.createTableIfNotExists('cases', (table) => {
      table.string('id', 100).primary();
      table.string('defendant', 100);
      table.timestamp('date');
      table.string('time', 100);
      table.string('room', 100);
      table.jsonb('citations');
    })
      .then(() => createIndexForCases());
  },
  queued() {
    return knex.schema.createTableIfNotExists('queued', (table) => {
      table.increments('queued_id').primary();
      table.dateTime('created_at');
      table.string('citation_id', 100);
      table.string('phone', 100);
      table.boolean('sent');
      table.boolean('asked_reminder');
      table.dateTime('asked_reminder_at');
    });
  },
  reminders() {
    return knex.schema.createTableIfNotExists('reminders', (table) => {
      table.increments('reminder_id').primary();
      table.dateTime('created_at');
      table.string('case_id', 100);
      table.string('phone', 100);
      table.boolean('sent', 100);
      table.jsonb('original_case');
    });
  },
};

/**
 * Insert chunk of data to table
 *
 * @param  {String} table Table to insert data to.
 * @param  {Array} rows Array of rows to insert into the table.
 * @param  {number} size number of rows to insert into the table at one time.
 * @return {Promise}
 */
function batchInsert(table, rows, size) {
  console.log('batch inserting', rows.length, 'rows');

  // had to explicitly use transaction for record counts in test cases to work
  return knex.transaction(trx => trx.batchInsert(table, rows, size)
    .then(trx.commit)
    .catch(trx.rollback));
}

/**
 * Manually close database connection.
 *
 * @return {void}
 */
function closeConnection() {
  return knex.client.pool.destroy();
}

/**
 * Create specified table if it does not already exist.
 *
 * @param  {String} table [description]
 * @param  {function} table (optional) function to be performed after table is created.
 * @return {Promise}  Promise to create table if it does not exist.
 */
function createTable(table) {
  console.log('Trying to create table:', table);
  if (!createTableInstructions[table]) {
    console.log(`No Table Creation Instructions found for table "${table}".`);
    return false;
  }

  return knex.schema.hasTable(table)
    .then((exists) => {
      if (exists) {
        return console.log(`Table "${table}" already exists.  Will not create.`);
      }

      return createTableInstructions[table]()
        .then(() => {
          console.log(`Table created: "${table}"`);
        });
    });
}

/**
 * Drop specified table
 *
 * @param  {String} table name of the table to be dropped.
 * @return {Promise}  Promise to drop the specified table.
 */
function dropTable(table) {
  return knex.schema.dropTableIfExists(table)
    .then(console.log(`Dropped existing table "${table}"`));
}

/**
 * Ensure all necessary tables exist.
 *
 * Note:  create logic only creates if a table does not exists, so it is enough to just
 *   call createTable() for each table.
 *
 * @return {Promise} Promise to ensure all courtbot tables exist.
 */
function ensureTablesExist() {
  return Promise.all(Object.keys(createTableInstructions).map(createTable));
}

module.exports = {
  ensureTablesExist,
  closeConnection,
  createTable,
  dropTable,
  batchInsert,
  knex,
};
