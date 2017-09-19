require('dotenv').config();

const crypto = require('crypto');
const manager = require("./utils/db/manager");
const knex = manager.knex();
const now = require("./utils/dates").now;

exports.findCitation = function(citation) {
    const cleaned_citation = escapeSQL(citation.toUpperCase().trim());
    return knex('cases').where('citations', '@>', `[{"id": "${cleaned_citation}"}]`).select();
 };

// Find queued citations that we have asked about adding reminders
exports.findAskedQueued = function(phone) {
    const cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
    const encryptedPhone = cipher.update(phone, 'utf8', 'hex') + cipher.final('hex');

    // Filter for new ones. If too old, user probably missed the message (same timeframe as Twilio sessions - 4 hours). Return IFF one found. If > 1 found, skip
    return knex('queued')
        .where('phone',encryptedPhone).andWhere('asked_reminder',true)
        .andWhereRaw(`"asked_reminder_at" > current_timestamp - interval '4 hours'`)
        .select()
        .then((rows) => {
            if (rows.length == 1) {
                return knex('queued')
                .where('queued_id', rows[0].queued_id)
                .update({'asked_reminder':false})
                .then((values) => knex('cases').where('citations', '@>', `[{"id": "${rows[0].citation_id}"}]`))
            } else {
                return  [];
            }
        })
};

exports.fuzzySearch = function(str) {
    const parts = str.trim().toUpperCase().split(" ");

    // Search for Names
    let query = knex('cases').where('defendant', 'ilike', '%' + parts[0] + '%');
    if (parts.length > 1) query = query.andWhere('defendant', 'ilike', '%' + parts[1] + '%');

    // Search for Citations
    const cleaned_citation = escapeSQL(parts[0]);
    query = query.orWhere('citations', '@>', `[{"id": "${cleaned_citation}"}]`);

    // Limit to ten results
    query = query.limit(10);
    return query;
};

exports.addReminder = function(data) {
    const cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
    const encryptedPhone = cipher.update(data.phone, 'utf8', 'hex') + cipher.final('hex');

    return knex('reminders').insert({
        case_id: data.caseId,
        sent: false,
        phone: encryptedPhone,
        created_at: now(),
        original_case: data.originalCase,
    })
};

exports.addQueued = function(data) {
    const cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
    const encryptedPhone = cipher.update(data.phone, 'utf8', 'hex') + cipher.final('hex');

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
