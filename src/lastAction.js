
module.exports = function() {
	"use strict";
	var noop = function(){};
	/**
	 * The LastAction object accepts actions (functions that return promises) only executing the last
	 * action available and dropping the rest. The object also waits for a executed action to complete before
	 * executing the next one.
	 * Note: This is a only client side solution to ordering actions, more network efficient solutions
	 * can be achieved with server collaboration, sequence numbers, acks...
	 *
	 * @param  {Function}   onComplete     Executes when an action completes successfully and no action is
	 *                                     waiting to be executed
	 * @param  {Function}   onError        Executes when an action fails and no action is
	 *                                     waiting to be executed
	 * @param  {Int}   retries             Number of retries for each action before failing, default: 0
	 * @return {LastAction}                LastAction instance
	 */
	var LastAction = function(onComplete, onError, retries) {
		this.onError = onError || noop;
		this.onComplete = onComplete || noop;
		this.retries = retries || 0;
		this._deferred = null;
		this.lastAction = null;
	};

	/**
	 * Aux function to emulate jQuery deferred functionality
	 * @return {Object} Object with resolve and reject methods and a promise property
	 */
	var deferred = function(){
		var dfr;
		var promise = new Promise(function(resolve, reject){
			dfr = {
				resolve: resolve,
				reject: reject
			};
		});
		dfr.promise = promise;
		return dfr;
	};

	/**
	 * Function for DRY, takes an action response and cleans it's deferred
	 * or resolved the next one if exists
	 * @param  {LastAction}   self     Instance
	 * @param  {mixed}   response Action response
	 * @param  {Deferred}   dfr      Action deferred
	 * @param  {Function} callback To call if last Action
	 * @return {mixed}            Chain response
	 */
	var resolver = function(self, response, dfr, callback) {
		if (dfr === self._deferred) {
			self._deferred = null;
			self._lastResponse = response;
			callback(response);
		} else {
			self._deferred.resolve(response);
		}
		return response;
	};

	/**
	 * Function for DRY. Executes an action and calls resolver in case of success or error
	 * @param  {LastAction} self     Instance
	 * @param  {Function} action   action to execute
	 * @param  {Deferred} dfr      Pass along to the resolver
	 * @return {promise}           Filtered after resolver action promise
	 */
	var actionExecuter = function(self, action, dfr) {
		return action().then(function(response) {
			return resolver(self, response, dfr, self.onComplete);
		}, function(response) {
			throw resolver(self, response, dfr, self.onError);
		});
	};

	/**
	 * Recursively handles actions retries, dropping retries if a newer action
	 * is available
	 * @param  {LastAction} self     Instance
	 * @param  {Function} action   Action to execute
	 * @param  {Int} retries   Number of times to retry the action
	 * @param  {Deferred} dfr       Resolved when retries are done
	 * @return {Promise}           Promise that resolves on success or is rejected when out of retries
	 */
	var retrier = function(self, action, retries, dfr){
		push(self, action).then(function(response){
			dfr.resolve(response);
		}, function(response) {
			if (self._deferred === null && retries > 0) {
				retrier(self, action, retries - 1, dfr);
			} else {
				dfr.reject(response);
			}
		});
	};

	/**
	 * Checks if there is an action to wait for and sets self._deferred so when the action
	 * is over this can be triggered. Or executes the action immediately.
	 * @param  {LastAction} self   instance
	 * @param  {Function} action Action to execute
	 * @return {Promise}        Resolves when the actions finishes (if it does)
	 */
	var push = function(self, action) {
		self.lastAction = action;
		var dfr = deferred();
		if (self._deferred) {
			self._deferred = dfr;
			return self._deferred.promise.then(function(response) {
				return actionExecuter(self, action.bind(null, response), dfr);
			});
		} else {
			self._deferred = dfr;
			return actionExecuter(self, action.bind(null, self._lastResponse), dfr);
		}
	};


	LastAction.prototype = {
		/**
		 * Adds an action to be executed if no other action is added before the last one finishes
		 * @param  {Function} action  Function that returns an action, receives a parameter from the lastPromise
		 *                            action executed or null
		 * @param  {Int} retries    Number of retries for this action (overrides the default on the constructor)
		 * @return {Promise}         Promise that resolves if the action is actually executed and resolves.
		 */
		push: function(action, retries) {
			retries = retries === undefined ? this.retries : retries;
			var dfr = deferred();
			retrier(this, action, retries, dfr);
			return dfr.promise;
		},

		/**
		 * Last action that was added to this instance of LastAction or null if no action has been added
		 * @return {Function} action
		 */
		lastAction: function() {
			return this.lastAction;
		}
	};

	return LastAction;
}();
