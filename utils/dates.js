var moment = require("moment-timezone");

/**
 * Utility functions for working with dates, which hide timezone details...
 * @type {Object}
 */
module.exports = {

	/**
	 * Timezone string maintained in our environment configuration file.
	 * @return {string} timezone
	 */
	timezone: function() {
		return process.env.TIMEZONE;
	},

	/**
	 * UTC timezone offset in minutes.
	 * @return {int} offset
	 */
	timezoneOffset: function() {
		return process.env.TIMEZONE_OFFSET;
	},
	
	/**
	 * Get current moment timestamp, using our environment timezone.
	 * @return {moment} moment object
	 */
	now: function() {
		return moment.utc().utcOffset(module.exports.timezoneOffset());
	},

	/**
	 * ISO formatted date string to UTC formatted date string with UTC offset.
	 * @param  {string} date ISO formatted date string
	 * @return {string}      UTC formatted date string
	 */
	isoToUtc: function(date) {
		return moment.utc(date).utcOffset(module.exports.timezoneOffset()).format();
	},

	/**
	 * Convert UTC date string to moment object.
	 * @param  {string} date UTC formatted date string.
	 * @return {moment}      moment using appropriate timezone offset
	 */
	fromUtc: function(date) {
		return moment.utc(date).utcOffset(module.exports.timezoneOffset());
	},
	
	/**
	 * Take separate date and time and combine them into single moment object
	 * 
	 * @param  {string} date in format MM/DD/YYYY or MM-DD-YYYY
	 * @param  {string} time time in format "hh:mm A"
	 * @return {moment} moment combine separate date and time into a single date and time moment object.
	 */
	fromDateAndTime: function(date, time) {
		return moment(date + " " + time + " " + module.exports.timezoneOffset(), "MM/DD/YYYY hh:mm A Z");
	},

	/**
	 * Determine if a date is passed its allowed window of days.
	 * @return {Boolean} true means it has been sitting too long.
	 */
	hasSatTooLong: function(checkdate) {
		return module.exports.now().diff(moment(checkdate), 'days') > process.env.QUEUE_TTL_DAYS;
	},

	/**
	 * Format time from date/moment object to hh:mm am/pm
	 * @return {string} formatted time.
	 */
	toFormattedTime: function(date) {
		return moment(date).format("hh:mm A");
	}
};