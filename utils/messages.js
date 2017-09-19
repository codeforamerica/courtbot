const twilio = require('twilio');
const dates = require('./dates');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * reduces whitespace to a single space
 *
 * Note: This is useful for reducing the character length of a string
 * when es6 string templates are used.
 *
 * @param  {String} msg the message to normalize
 * @return {String} the msg with whitespace condensed to a single space
 */
function normalizeSpaces(msg) {
  return msg.replace(/\s\s+/g, ' ');
}

/**
 * message to go to the site for more information
 *
 * @return {String} message.
 */
function forMoreInfo() {
  return normalizeSpaces(`OK. You can always go to ${process.env.COURT_PUBLIC_URL}
    for more information about your case and contact information.`);
}

/**
 * tell them of the court date, and ask them if they would like a reminder
 *
 * @param  {Boolean} includeSalutation true if we should greet them
 * @param  {string} name Name of cited person/defendant.
 * @param  {moment} datetime moment object containing date and time of court appearance.
 * @param  {string} room room of court appearance.
 * @return {String} message.
 */
function foundItAskForReminder(includeSalutation, name, datetime, room) {
  const salutation = `Hello from the ${process.env.COURT_NAME}. `;

  const caseInfo = `We found a case for ${name} scheduled
    ${(datetime.isSame(dates.now(), 'd') ? 'today' : `on ${datetime.format('ddd, MMM Do')}`)}
    at ${datetime.format('h:mm A')}, at ${room}.`;

  let futureHearing = '';
  if ((datetime.diff(dates.now()) > 0) && (datetime.isSame(dates.now(), 'd'))) { // Hearing today
    futureHearing = ' a future hearing';
  } else if (datetime.diff(dates.now()) <= 0) { // Hearing already happened
    futureHearing = ' a future hearing';
  }

  return normalizeSpaces(`${(includeSalutation ? salutation : '')}${caseInfo}
    Would you like a courtesy reminder the day before${futureHearing}? (reply YES or NO)`);
}

/**
 * greeting, who i am message
 *
 * @return {String} message.
 */
function iAmCourtBot() {
  return 'Hello, I am Courtbot. I have a heart of justice and a knowledge of court cases.';
}

/**
 * tell them their case number input was invalid
 *
 * @return {String} message.
 */
function invalidCaseNumber() {
  return normalizeSpaces(`Couldn't find your case. Case identifier should be 6 to 25
    numbers and/or letters in length.`);
}

/**
 * tell them we could not find it and ask if they want us to keep looking
 *
 * @return {String} message.
 */
function notFoundAskToKeepLooking() {
  return normalizeSpaces(`Could not find a case with that number. It can take
    several days for a case to appear in our system. Would you like us to keep
    checking for the next ${process.env.QUEUE_TTL_DAYS} days and text you if
    we find it? (reply YES or NO)`);
}

/**
 * Reminder message body
 *
 * @param  {Object} occurrence reminder record.
 * @return {string} message
 */
function reminder(occurrence) {
  return normalizeSpaces(`Reminder: It appears you have a court hearing tomorrow at
    ${dates.fromUtc(occurrence.date).format('h:mm A')} at ${occurrence.room}.
    You should confirm your hearing date and time by going to
    ${process.env.COURT_PUBLIC_URL}.
    - ${process.env.COURT_NAME}`);
}

/**
 * Message to send when we we cannot find a person's court case for too long.
 *
 * @return {string} Not Found Message
 */
function unableToFindCitationForTooLong() {
  return normalizeSpaces(`We haven't been able to find your court case.
  You can go to ${process.env.COURT_PUBLIC_URL} for more information.
  - ${process.env.COURT_NAME}`);
}

/**
 * tell them we will keep looking for the case they inquired about
 *
 * @return {string} message
 */
function weWillKeepLooking() {
  return normalizeSpaces(`OK. We will keep checking for up to ${process.env.QUEUE_TTL_DAYS} days.
    You can always go to ${process.env.COURT_PUBLIC_URL} for more information about
    your case and contact information.`);
}

/**
 * tell them we will try to remind them as requested
 *
 * @return {String} message.
 */
function weWillRemindYou() {
  return normalizeSpaces(`Sounds good. We will attempt to text you a courtesy reminder
    the day before your hearing date. Note that court schedules frequently change.
    You should always confirm your hearing date and time by going
    to ${process.env.COURT_PUBLIC_URL}.`);
}


/**
 * Send a twilio message
 *
 * @param  {string} to   phone number message will be sent to
 * @param  {string} from who the message is being sent from
 * @param  {string} body message to be sent
 * @param  {function} function for resolving callback
 * @return {Promise} Promise to send message.
 */
function send(to, from, body) {
  return new Promise((resolve) => {
    client.sendMessage({ to, from, body }, resolve);
  });
}

module.exports = {
  forMoreInfo,
  foundItAskForReminder,
  iAmCourtBot,
  invalidCaseNumber,
  notFoundAskToKeepLooking,
  weWillKeepLooking,
  weWillRemindYou,
  reminder,
  send,
  unableToFindCitationForTooLong,
};
