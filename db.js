require('dotenv').config();

const crypto = require('crypto');
const manager = require('./utils/db/manager');
const now = require('./utils/dates').now;

const knex = manager.knex;

function escapeSQL(val) {
  return val.replace(/[^A-Za-z0-9\-]/g, '');
}

/**
 * encrypts the phone number
 *
 * param {string} phone number to encrypt
 * returns {string} encrypted phone number
 */
function encryptPhone(phone) {
  // Be careful when refactoring this function, the decipher object needs to be created
  //    each time a reminder is sent because the decipher.final() method destroys the object
  //    Reference: https://nodejs.org/api/crypto.html#crypto_decipher_final_output_encoding
  const cipher = crypto.createCipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  return cipher.update(phone, 'utf8', 'hex') + cipher.final('hex');
}

/**
 * decrypts the phone number
 *
 * param {string} phone number to decrypt
 * returns {string} decrypted phone number
 */
function decryptPhone(phone) {
  // Be careful when refactoring this function, the decipher object needs to be created
  //    each time a reminder is sent because the decipher.final() method destroys the object
  //    Reference: https://nodejs.org/api/crypto.html#crypto_decipher_final_output_encoding
  const decipher = crypto.createDecipher('aes256', process.env.PHONE_ENCRYPTION_KEY);
  return decipher.update(phone, 'hex', 'utf8') + decipher.final('utf8');
}

function findCitation(citation) {
  const cleanedCitation = escapeSQL(citation.toUpperCase().trim());
  return knex('cases').where('citations', '@>', `[{"id": "${cleanedCitation}"}]`).select();
}

// Find queued citations that we have asked about adding reminders
function findAskedQueued(phone) {
  // Filter for new ones. If too old, user probably missed the message (same timeframe
  // as Twilio sessions - 4 hours). Return IFF one found. If > 1 found, skip
  return knex('queued')
    .where('phone', encryptPhone(phone)).andWhere('asked_reminder', true)
    .andWhereRaw(`"asked_reminder_at" > current_timestamp - interval '4 hours'`)
    .select()
    .then((rows) => {
      if (rows.length === 1) {
        return knex('queued')
          .where('queued_id', rows[0].queued_id)
          .update({ asked_reminder: false })
          .then(() => knex('cases').where('citations', '@>', `[{"id": "${rows[0].citation_id}"}]`));
      }
      return [];
    });
}

function fuzzySearch(str) {
  const parts = str.trim().toUpperCase().split(' ');

  // Search for Names
  let query = knex('cases').where('defendant', 'ilike', `%${parts[0]}%`);
  if (parts.length > 1) query = query.andWhere('defendant', 'ilike', `%${parts[1]}%`);

  // Search for Citations
  const cleanedCitation = escapeSQL(parts[0]);
  query = query.orWhere('citations', '@>', `[{"id": "${cleanedCitation}"}]`);

  // Limit to ten results
  query = query.limit(10);
  return query;
}

function addReminder(data) {
  return knex('reminders').insert({
    case_id: data.caseId,
    sent: false,
    phone: encryptPhone(data.phone),
    created_at: now(),
    original_case: data.originalCase,
  });
}

function addQueued(data) {
  return knex('queued').insert({
    citation_id: data.citationId,
    sent: false,
    phone: encryptPhone(data.phone),
    created_at: now(),
  });
}

module.exports = {
  addReminder,
  addQueued,
  decryptPhone,
  encryptPhone,
  findAskedQueued,
  findCitation,
  fuzzySearch,
};
