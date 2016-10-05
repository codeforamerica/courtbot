module.exports = {

	/**
	 * Greeting message 1/2 template
	 * 
	 * @return {String} First of two greeting messages.
	 */
	greetingOneOfTwo: function() {
		return "(1/2) Hello from the Alaska State Court System.";
	},

	/**
	 * Greeting message 2/2 template
	 * 
	 * @param  {string} name Name of cited person.
	 * @param  {moment} datetime moment object containing date and time of court appearance.
	 * @param  {string} room room of court appearance.
	 * @return {string} Second of two greeting messages.
	 */
	greetingTwoOfTwo: function(name, datetime, room) {
		return `(2/2) We found a case for ${name} scheduled on ${datetime.format('ddd, MMM Do')} at ${datetime.format("h:mm A")}, at ${room}. Would you like a courtesy reminder the day before? (reply YES or NO)`;
	},

	/**
	 * Message to send when we we cannot find a person's court case for too long.
	 * @return {string} Not Found Message
	 */
	unableToFindCitationForTooLong: function() {
        return "We haven\'t been able to find your court case. You can go to " + process.env.COURT_PUBLIC_URL + " for more information. - Alaska State Court System";
	}
}