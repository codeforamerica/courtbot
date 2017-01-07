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
	 * UTC timezone offset in minutes
	 * @atDate - Effective date for the offset
	 * @return {int} offset
	 */
	timezoneOffset: function(atDate) {
		var dt = atDate ? atDate : moment().format("YYYY-MM-DD");
		var tz = moment.tz(dt, process.env.TIMEZONE).format('Z');
		console.log("Date: " + moment(dt).format("YYYY-MM-DD") + " Offset: " + tz);
		return tz;
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
		console.log("RAW DATE FROM DB:", date);
		var dt = moment.utc(date);
		dt = dt.utcOffset(module.exports.timezoneOffset(dt)).format();
		return dt;
	},

	/**
	 * Convert UTC date string to moment object.
	 * @param  {string} date UTC formatted date string.
	 * @return {moment}      moment using appropriate timezone offset
	 */
	fromUtc: function(date) {
		var dt = moment.utc(date);
		dt = dt.utcOffset(module.exports.timezoneOffset(dt));
		return dt;
	},
	
	/**
	 * Take separate date and time and combine them into single moment object
	 * 
	 * @param  {string} date in format MM/DD/YYYY or MM-DD-YYYY
	 * @param  {string} time time in format "hh:mm A"
	 * @return {moment} moment combine separate date and time into a single date and time moment object.
	 */
	fromDateAndTime: function(date, time) {
		return moment(date + " " + time + " " + module.exports.timezoneOffset(date), "MM/DD/YYYY hh:mm A Z");
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