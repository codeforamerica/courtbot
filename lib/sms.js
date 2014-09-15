var twilio = require('twilio');
var moment = require('moment');

exports.get = function(key, details) {
  var twiml = new twilio.TwimlResponse();

  switch(key) {
    case 'PROMPT_QUEUE':
      twiml.sms('Couldn\'t find your case. It takes 14 days for new citations to appear in the sytem. Would you like a text when we find your information? (Reply YES or NO)');
      break;
    case 'PROMPT_REMINDER': 
      twiml.sms('Found a court case for ' + cleanupName(details.defendant) + ' on ' + moment(details.date).format('dddd, MMM Do') + ' at ' + details.time +', in courtroom ' + details.room +'. Would you like a reminder the day before? (reply YES or NO)');
      break;
    case 'PROMPT_PAY':
      twiml.sms('You can pay now and skip court. Just call (404) 658-6940 or visit court.atlantaga.gov. \n\nOtherwise, your court date is ' + moment(details.date).format('dddd, MMM Do') + ' at ' + details.time +', in courtroom ' + details.room + '.');
      break;
    case 'CONFIRM_REMINDER':
      twiml.sms('Sounds good. We\'ll text you a day before your case. Call us at (404) 954-7914 with any other questions.');
      break;
    case 'DECLINE_REMINDER':
      twiml.sms('Alright, no problem. See you on your court date. Call us at (404) 954-7914 with any other questions.');
      break;
    case 'CONFIRM_QUEUE':
      twiml.sms('Sounds good. We\'ll text you in the next 14 days. Call us at (404) 954-7914 with any other questions.');
      break;
    case 'DECLINE_QUEUE':
      twiml.sms('No problem. Call us at (404) 954-7914 with any other questions.');
      break;
    case 'YES_OR_NO_ONLY':
      twiml.sms('Sorry, we didn\'t understand that response. Please reply YES or NO.');
      break;
    default:
      throw new Error('SMS string not found for the key: ', key);
  }

  return twiml.toString();
};

exports.isYes = function(str) {
  return str === 'YES' || str === 'YEA' || str === 'YUP' || str === 'Y';
};

exports.isNo = function(str) {
  return str === 'NO' || str ==='N';
};

function cleanupName(name) {
  // Switch LAST, FIRST to FIRST LAST
  var bits = name.split(',');
  name = bits[1] + ' ' + bits[0];
  name = name.trim();

  // Change FIRST LAST to First Last
  name = name.replace(/\w\S*/g, function(txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });

  return name;
}
