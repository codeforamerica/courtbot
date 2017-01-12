var crypto = require('crypto');
require('dotenv').config();
var manager = require("./utils/db/manager");
var knex = manager.knex();
var now = require("./utils/dates").now;

exports.findCitation = function(citation, callback) {
  // Postgres JSON search based on prebuilt index
  citation = escapeSQL(citation.toUpperCase().trim());
  var citationSearch = knex.raw("'{\"" + citation + "\"}'::text[] <@ (json_val_arr(citations, 'id'))");
  knex('cases').where(citationSearch).select().asCallback(callback);
};

// Find queued citations that we have asked about adding reminders
exports.findAskedQueued = function(phone, callback) {
  var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  var encryptedPhone = cipher.update(phone, 'utf8', 'hex') + cipher.final('hex');
  // Filter for new ones. If too old, user probably missed the message (same timeframe as Twilio sessions - 4 hours). Return IFF one found. If > 1 found, skip
  var query = knex('queued').where('phone',encryptedPhone).andWhere('asked_reminder',true).andWhereRaw('"asked_reminder_at" > current_timestamp - interval \'4 hours\'').select();
  query.then(function(rows) {
    if (rows.length == 1) {
      var citationSearch = knex.raw("'{\"" + rows[0].citation_id + "\"}'::text[] <@ (json_val_arr(citations, 'id'))");
      return knex('queued').where('queued_id', rows[0].queued_id).update({'asked_reminder':false}).then(function(values) {
        return knex('cases').where(citationSearch).select().then(function(rows) {
          return callback(null, rows);
        });
      });
    } else {
      return callback(null, []);
    }
  })
      .catch(callback);
};

exports.fuzzySearch = function(str, callback) {
  str = str.trim();
  var parts = str.toUpperCase().split(" ");

  // Search for Names
  var query = knex('cases').where('defendant', 'ilike', '%' + parts[0] + '%');
  if (parts.length > 1) query = query.andWhere('defendant', 'ilike', '%' + parts[1] + '%');

  // Search for Citations
  var citation = escapeSQL(parts[0]);
  var citationSearch = knex.raw("'{\"" + citation + "\"}'::text[] <@ (json_val_arr(citations, 'id'))");
  query = query.orWhere(citationSearch);

  // Limit to ten results
  query = query.limit(10);
  query.asCallback(callback);
};

exports.addReminder = function(data, callback) {
  var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  var encryptedPhone = cipher.update(data.phone, 'utf8', 'hex') + cipher.final('hex');

  knex('reminders').insert({
    case_id: data.caseId,
    sent: false,
    phone: encryptedPhone,
    created_at: now(),
    original_case: data.originalCase,
  }).asCallback(callback);
};

exports.addQueued = function(data, callback) {
  var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  var encryptedPhone = cipher.update(data.phone, 'utf8', 'hex') + cipher.final('hex');

  knex('queued').insert({
    citation_id: data.citationId,
    sent: false,
    phone: encryptedPhone,
    created_at: now()
  }).asCallback(callback);
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