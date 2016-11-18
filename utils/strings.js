/**
 * Collection of custom string utilitles for scrubbing data, etc... throughout this application.
 * @type {Object}
 */
module.exports = {

	/**
	 * Trim name and convert it to proper case.
	 * 	
	 * @param  {string} name - name to be
	 * @return {string} name - trimmed name in proper case
	 */
	scrubName: function(name) {
		return module.exports.toProperCase(name.trim());
	},

	/**
	 * Convert space delimited words to proper case
	 * 
	 * @param  {string} words - space delimited string to be transformed to proper case.
	 * @return {string} words - formatted proper case
	 */
	toProperCase : function(name) {
		return name.replace(/\w\S*/g, function(txt) { 
			return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); 
		});
	}
};