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
	},

	/**
	 * Generic callback handler for resolving a promise once a call has completed.
	 * 
	 * @param  {function} resolve resolve function for Promise that is to be resolved.
	 * @param  {string} errPrefix String prefix for error message if call fails and an error is returned.
	 */
	genericCallbackResolver: function(resolve, errPrefix) {
	  return function(err, result) {
	    if (err) {
	      console.log(errPrefix || "genericCallbackResolver()", err);
	    }
	    resolve(result);
	  };
	}
}