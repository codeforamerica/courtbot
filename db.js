var crypto = require('crypto');
var Knex = require('knex');
var knex = Knex.initialize({
  client: 'pg',
  connection: process.env.HEROKU_POSTGRESQL_NAVY_URL
});

exports.findCitation = function(citation, callback) {
  // Postgres JSON search based on prebuilt index
  citation = escapeSQL(citation.toUpperCase());
  var citationSearch = knex.raw("'{\"" + citation + "\"}'::text[] <@ (json_val_arr(citations, 'id'))");
  knex('cases').where(citationSearch).select().exec(callback);
};

exports.fuzzySearch = function(str, callback) {
  var parts = str.toUpperCase().split(" ");

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

exports.addReminder = function(data, callback) {
  var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  var encryptedPhone = cipher.update(data.phone, 'utf8', 'hex') + cipher.final('hex');

  knex('reminders').insert({
    case_id: data.caseId,
    sent: false,
    phone: encryptedPhone,
    created_at: new Date(),
    original_case: data.originalCase,
  }).exec(callback);
};

exports.addQueued = function(data, callback) {
  var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  var encryptedPhone = cipher.update(data.phone, 'utf8', 'hex') + cipher.final('hex');

  knex('queued').insert({
    citation_id: data.citationId,
    sent: false,
    phone: encryptedPhone,
    created_at: new Date(),
  }).exec(callback);
};

var escapeSQL = function(val) {
  val.replace(/[\0\n\r\b\t\\\'\"\x1a]/g, function(s) {
    switch(s) {
      case "\0": return "\\0";
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\b": return "\\b";
      case "\t": return "\\t";
      case "\x1a": return "\\Z";
      default: return "\\"+s;
    }
  });
  return val;
};
