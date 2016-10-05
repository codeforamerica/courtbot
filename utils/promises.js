var Promise = require('bluebird');

module.exports = {

	/**
	 * Take the results from a resolved promise, and send each result through a given task.
	 * Returns a single promise that will be resolved once all sub-tasks have completed.
	 *
	 * @param  {function} task task to be executed for each result.
	 * @return {Promise}  Promise to execute task for each result.
	 */
	forEachResult: function(task) {
		return function(results) {
			return Promise.map(results, task);
		}
	},

	/**
	 * Wrapper to simplify common chained promise pattern
	 * 
	 * @param  {function} resolver instructions to follow for executing promise.
	 * @return {Promise} Promise to execute instructions, once parent function is called.
	 */
	chainablePromise: function(resolver) {
	  return function() {
	    return new Promise(resolver);
	  };
	}
}