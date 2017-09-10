var crypto = require('crypto');
require('dotenv').config();
var manager = require("./utils/db/manager");
var knex = manager.knex();
var now = require("./utils/dates").now;

exports.findCitation = function(citation) {
  // Postgres JSON search based on prebuilt index
  citation = escapeSQL(citation.toUpperCase().trim());
  var citationSearch = knex.raw(`'{"${citation}"}'::text[] <@ (json_val_arr(citations, 'id'))`);
  return knex('cases').where(citationSearch).select();
};

// Find queued citations that we have asked about adding reminders
exports.findAskedQueued = function(phone) {
  var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  var encryptedPhone = cipher.update(phone, 'utf8', 'hex') + cipher.final('hex');

  // Filter for new ones. If too old, user probably missed the message (same timeframe as Twilio sessions - 4 hours). Return IFF one found. If > 1 found, skip
  return knex('queued')
    .where('phone',encryptedPhone).andWhere('asked_reminder',true)
    .andWhereRaw(`"asked_reminder_at" > current_timestamp - interval '4 hours'`)
    .select()
    .then(function(rows) {
      if (rows.length == 1) {
        var citationSearch = knex.raw(`'{"${rows[0].citation_id}"}'::text[] <@ (json_val_arr(citations, 'id'))`);
        return knex('queued')
          .where('queued_id', rows[0].queued_id)
          .update({'asked_reminder':false})
          .then(function(values) {
            return knex('cases').where(citationSearch).select()
          })
      } else {
        return  [];
      }
    })
};

exports.fuzzySearch = function(str) {
  str = str.trim();
  var parts = str.toUpperCase().split(" ");

  // Search for Names
  var query = knex('cases').where('defendant', 'ilike', '%' + parts[0] + '%');
  if (parts.length > 1) query = query.andWhere('defendant', 'ilike', '%' + parts[1] + '%');

  // Search for Citations
  var citation = escapeSQL(parts[0]);
  var citationSearch = knex.raw(`'{"${citation}"}'::text[] <@ (json_val_arr(citations, 'id'))`);
  query = query.orWhere(citationSearch);

  // Limit to ten results
  query = query.limit(10);
  return query;
};

exports.addReminder = function(data) {
  var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  var encryptedPhone = cipher.update(data.phone, 'utf8', 'hex') + cipher.final('hex');

  return knex('reminders').insert({
    case_id: data.caseId,
    sent: false,
    phone: encryptedPhone,
    created_at: now(),
    original_case: data.originalCase,
  })
};

exports.addQueued = function(data) {
  var cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  var encryptedPhone = cipher.update(data.phone, 'utf8', 'hex') + cipher.final('hex');

  return knex('queued').insert({
    citation_id: data.citationId,
    sent: false,
    phone: encryptedPhone,
    created_at: now()
  });
};

var escapeSQL = function(val) {
    return val.replace(/[^A-Za-z0-9\-]/g, "")
  };
