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
	 * Used by node postgres driver for mapping timestamptz type strings to the correct string format to be processed
	 * once returned by a query.
	 *
	 * @todo: code should be refactored so that all inserts/retrieves/updates are done through a single module, and that
	 * 			module should handle data transformations, all in one place.
	 * 
	 * @param  {string} date ISO formatted 0 offset UTC date.
	 * @return {string}      UTC formatted date with the correct offset.
	 */
	pgDateParser: function(date) {
		//console.log("HIT OUR CUSTOM PARSER:", moment(date).utcOffset(module.exports.timezoneOffset()).format());
		return moment(date).utcOffset(module.exports.timezoneOffset()).format();
	},

	/**
	 * Get current moment timestamp, using our environment timezone.
	 * @return {moment} moment object
	 */
	now: function() {
		return moment.utc().utcOffset(module.exports.timezoneOffset());
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
	 * Compare 2 date strings and return the newer of the two.
	 * @param  {string} left  utc formatted date string
	 * @param  {string} right utc formatted date string
	 * @return {string}       newer utc formatted date string
	 */
	newer: function(left, right) {
		return moment.max(module.exports.fromUtc(left), module.exports.fromUtc(right)).format();
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