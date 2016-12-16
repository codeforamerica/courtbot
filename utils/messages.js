var twilio = require('twilio');
var client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
var dates = require("./dates");
var Promise = require("bluebird");
var promises = require("./promises"),
	chainable = promises.chainablePromise,
	genericResolver = promises.genericCallbackResolver;

module.exports = {

	/**
	 * Greeting message for informing caller of a court date, and asking them if they would like a reminder
	 *
	 * @param  {string} name Name of cited person.
	 * @param  {moment} datetime moment object containing date and time of court appearance.
	 * @param  {string} room room of court appearance.	 * 
	 * @return {String} Greetings message.
	 */
	greetingMessage: function(name, datetime, room) {
		return "Hello from the Alaska State Court System. " +
				"We found a case for " + name + " scheduled on " + 
				datetime.format('ddd, MMM Do') + " at " + 
				datetime.format("h:mm A") + ", at " + room + 
				". Would you like a courtesy reminder the day before? (reply YES or NO)";
	},

	/**
	 * Message to send when we we cannot find a person's court case for too long.
	 * @return {string} Not Found Message
	 */
	unableToFindCitationForTooLong: function() {
        return "We haven\'t been able to find your court case. You can go to " + process.env.COURT_PUBLIC_URL + " for more information. - Alaska State Court System";
	},

	/**
	 * Reminder message body
	 * 
	 * @param  {Object} reminder reminder record.
	 * @return {string} message body.
	 */
	reminder: function(reminder) {
		return "Reminder: It appears you have a court hearing tomorrow at " + 
			dates.fromUtc(reminder.date).format("h:mm A") +
        	" at " + reminder.room + 
        	". You should confirm your hearing date and time by going to " + 
        	process.env.COURT_PUBLIC_URL + 
        	". - Alaska State Court System";
	},
	
	/**
	 * Send a twilio message
	 * 
	 * @param  {string} to   phone number message will be sent to
	 * @param  {string} from who the message is being sent from
	 * @param  {string} body message to be sent
	 * @param  {function} function for resolving callback
	 * @return {Promise} Promise to send message.
	 */
	send: function(to, from, body, resolver) {
		return new Promise(function(resolve, reject) {
			client.sendMessage({to: to, from: from, body: body}, resolver || genericResolver(resolve, "client.message"));			
		});
	}


}
