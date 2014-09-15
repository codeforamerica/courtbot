var knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL
});
var security = require('./security');

exports.getCase = function(citation, callback) {
  // Postgres JSON search based on prebuilt index
  citation = escapeSQL(citation.toUpperCase());
  var citationSearch = knex.raw("'{\"" + citation + "\"}'::text[] <@ (json_val_arr(citations, 'id'))");
  knex('cases').where(citationSearch).select().exec(function(err, data) {
    if (data.length === 0) return callback('Case not found');
    callback(null, data[0]);
  });
};

// Does a fuzzy match against a string, looking at defendent names
exports.findCase = function(str, callback) {
  var parts = str.toUpperCase().split(' ');

  // Search for Names
  var query = knex('cases').where('defendant', 'like', '%' + parts[0] + '%');
  if (parts.length > 1) query = query.andWhere('defendant', 'like', '%' + parts[1] + '%');

  // Search for Citations
  var citation = escapeSQL(parts[0]);
  var citationSearch = knex.raw("'{\"" + citation + "\"}'::text[] <@ (json_val_arr(citations, 'id'))");
  query = query.orWhere(citationSearch);

  // Limit to ten results
  query = query.limit(10);
  query.exec(callback);
};

// Gets all the currently queued cases
exports.getAllQueued = function(callback) {
  knex('queued')
    .where('sent', false)
    .select()
    .exec(callback);
};

// Marks a queued item as 'sent'
exports.resolveQueued = function(id, callback) {
  knex('queued')
    .where('queued_id', '=', id)
    .update({ sent: true })
    .exec(callback);
};

// Create a queued case, using a citation and a phone number
// e.g. db.addQueued({ citation_id: '124242', phone: '4154329889' }, callback);
exports.addQueued = function(data, callback) {
  knex('queued').insert({
    citation_id: data.citation_id,
    sent: false,
    phone: security.encryptPhone(data.phone),
    created_at: new Date(),
  }).exec(callback);
};

// Finds reminders for cases happening tomorrow
exports.getTomorrowsReminders = function(callback) {
  knex('reminders')
    .where('sent', false)
    .join('cases', 'reminders.case_id', '=', 'cases.id')
    .where('cases.date', 'tomorrow')
    .select()
    .exec(callback);
};

exports.resolveReminder = function(id, callback) {
  knex('reminders')
    .where('reminder_id', '=', id)
    .update({ sent: true })
    .exec(callback);
};

// Create a reminder, using a case id and a phone number.
// If you pass the original case data, that will be preserved to aid debugging.
// e.g. db.addReminder({ case_id: '89b97e', phone: '4154329889' }, callback);
exports.addReminder = function(data, callback) {
  knex('reminders').insert({
    case_id: data.case_id,
    sent: false,
    phone: security.encryptPhone(data.phone),
    created_at: new Date(),
    original_case: data.original_case,
  }).exec(callback);
};

// Close the connection pool for tests and scripts.
exports.close = function() {
  knex.client.pool.destroy();
};

function escapeSQL(val) {
  val.replace(/[\0\n\r\b\t\\\'\"\x1a]/g, function(s) {
    switch(s) {
      case '\0': return '\\0';
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\b': return '\\b';
      case '\t': return '\\t';
      case '\x1a': return '\\Z';
      default: return '\\'+s;
    }
  });
  return val;
}
