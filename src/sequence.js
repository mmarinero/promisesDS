module.exports = function() {
	"use strict";
	/**
	 * Abstracts a sequence of a asynchronous actions, the order of execution of the
	 * different actions is enforced using deferred objects.
	 * The successful completion of an action will trigger the start of the next one.
	 * If an action fails the following actions will fail too until an action with
	 * fallback is found in the queue (the fallback action will be called then).
	 *
	 * Actions consist of a function that receives a Deferred object as its first
	 * parameter and the result of the previous action as the following parameters.
	 *
	 * A Deferred object consists of a resolve and reject methods that manage the underlying
	 * promise
	 *
	 * Actions are pushed using the available methods or using an array when
	 * the sequence is created.
	 * For every push feature there is an object syntax using properties and a
	 * method and parameters syntax. Additional features include pushing promises,
	 * setting timeouts for the sequence to reach a point and executing actions
	 * when the queue is empty.
	 *
	 * @param {array[Object|function]} actions An array with the inital actions to
	 *     execute in the secuence using
	 *     object syntax:
	 *         Function: action to execute. The sequence will continue when it resolves
	 *             its Deferred object.
	 *         {action, fallback}: action and fallback in case of failure of the
	 *             previous action.
	 *         {promise}: promise that will stop the secuence untils it's completed
	 *         {synchronous}: action executed synchronously without the need to resolve
	 *             the deferred object.
	 *         {timeout, duration}: action to execute if the Sequence has not
	 *             reached that point after duration.
	 *         {whenEmpty, fallback}: action to execute when the sequence has no
	 *             pending actionsto execute.
	 */
	var Sequence = function (actions) {
		var self = this;
		this.lastPromise = Promise.resolve();
		if (Array.isArray(actions)) {
			actions.forEach(function (action) {
				self.pushObject(action);
			});
		} else if (actions !== undefined) {
			throw new Error('actions (if passed) must be an array');
		}
	};

	/**
	 * Aux function to emulate jQuery deferred functionality
	 * @return {Object} Object with resolve and reject methods and a promise property
	 */
	var deferred = function() {
		var dfr;
		var promise = new Promise(function(resolve, reject) {
			dfr = {
				resolve: resolve,
				reject: reject
			};
		});
		dfr.promise = promise;
		return dfr;
	};

	/**
	 * Adds an action with object syntax @see Sequence(actions)
	 * @param  {Object} obj action or feature to add to the sequence
	 * @return {Sequence}     current instance to allow chaining
	 */
	Sequence.prototype.pushObject = function (obj) {
		if (obj && obj.call) {
			this.push(obj);
		} else if (obj.action) {
			this.push(obj.action, obj.fallback);
		} else if (obj.timeout) {
			this.setTimeout(obj.timeout, obj.duration);
		} else if (obj.whenEmpty) {
			this.whenEmpty(obj.whenEmpty, obj.fallback);
		} else if (obj.promise) {
			this.pushPromise(obj.promise);
		} else if (obj.synchronous) {
			this.pushSynchronous(obj.synchronous, obj.fallback);
		} else {
			var err = new Error('action not recognized ' + obj);
			err.action = obj;
			throw err;
		}
		return this;
	};

	/**
	 * [private] Pipes the resolveWith and rejectWith of two promises so when the origin
	 * is completed the target completes too. Checks if origin is a promise
	 * @param  {Promise} origin promise to attach the callbacks to pipe the completion
	 * @param  {Deferred} target deferred linked to the origin promise
	 */
	var pipeResolve = function (origin, target) {
		if (origin && origin.then && origin.then.call) {
			origin.then(function (value) {
				target.resolve(value);
			}, function (value) {
				target.reject(value);
			});
		}
	};


	/**
	 * Main method to add actions to the sequence pushes actions at the end of
	 * the sequence that will be executed when all the previous ones are resolved.
	 * The fallback method is called if the previous action failed.
	 * @param  {Function} action   Action to execute
	 *         (action(deferred, [args,]) : result)
	 *         deferred: Deferred object that will trigger the next action if
	 *         completed succesfully or call the next fallback if rejected. The
	 *         arguments passed when resolved will be passed to the next action or
	 *         fallback.
	 *         args: optional arguments sent by the previous action.
	 *         result: optional Deferred that will resolve the action instead of the
	 *         parameter deferred
	 * @param  {Function} fallback Action to execute if the last action failed
	 *         (fallback(deferred, [args,]) : result)
	 *         deferred: Deferred object that will trigger the next action if
	 *         completed succesfully or call the next fallback if rejected. The
	 *         arguments passed when resolved will be passed to the next action or
	 *         fallback.
	 *         args: optional arguments sent by the previous action.
	 *         result: optional Deferred that will resolve the action instead of the
	 *         parameter deferred
	 * @return {Sequence}          current instance to allow chaining
	 */
	Sequence.prototype.push = function (action, fallback) {
		var nextDeferred = deferred();
		var oldPromise = this.lastPromise;
		this.lastPromise = nextDeferred.promise;
		delete nextDeferred.promise;
		oldPromise.then(function (value) {
			var result = action(nextDeferred, value);
			pipeResolve(result, nextDeferred);
		});
		if (fallback) {
			oldPromise.then(null, function (value) {
				var result = fallback(nextDeferred, value);
				pipeResolve(result, nextDeferred);
			});
		} else {
			oldPromise.then(null, function (value) {
				nextDeferred.reject(value);
			});
		}
		return this;
	};


	/**
	 * Pushes a promise into the sequence, the sequence cannot control
	 * the start of the action but guarantees that the next action will not
	 * be executed until all the previous ones and the promise completes
	 * @param  {Promise} promise Promise to introduce in the sequence
	 * @return {Sequence}         current instance to allow chaining
	 */
	Sequence.prototype.pushPromise = function (promise) {
		var oldPromise = this.lastPromise;
		this.push(function (deferred) {
			oldPromise.then(function () {
				promise.then(function (value) {
					deferred.resolve(value);
				}, function (value) {
					deferred.reject(value);
				});
			}, function (value) {
				promise.always(function () {
					deferred.reject(value);
				});
			});
		});
		return this;
	};

	/**
	 * Adds an action and a fallback to be executed synchronously.
	 * The function don't receive a deferred object and they will execute
	 * when the previous action completes and the next action will be triggered
	 * as soon as the function exits.
	 * Synchronous actions cannot stop the execution of the next action.
	 * @param  {Function} action   Action to execute if the previous one completes
	 *         successfully.
	 *         (action([args,]) : result)
	 *         args: optional arguments sent by the previous action.
	 *         result: optional return value sent to the next action
	 * @param  {Function} fallback Action to execute if the previous one fails.
	 *         (fallback([args,]) : result)
	 *         args: optional arguments sent by the previous actions.
	 *         result: optional return value sent to the next action
	 * @return {Sequence}          current instance to allow chaining
	 */
	Sequence.prototype.pushSynchronous = function (action, fallback) {
		this.push(function (deferred, value) {
			var result = action(value);
			deferred.resolve(result);
		}, function (deferred, value) {
			var result = fallback(value);
			deferred.resolve(result);
		});
		return this;
	};

	/**
	 * Sets a timeout at the current position in the sequence if the timeout
	 * expires before the previous action completes the handler will be fired
	 * as if it were a regular action. If the previous action completes before
	 * the timeout expires the next action will be executed and the timeout
	 * handler will never be called.
	 * @param  {Function} handler  Action to execute if the timeout expires
	 *                             (handler(deferred) : result)
	 *                             @see Sequence.push() action parameter
	 * @param  {Int} duration      Milliseconds to wait before triggering
	 *                             the timeout handler
	 * @return {Sequence}          current instance to allow chaining
	 */
	Sequence.prototype.setTimeout = function (handler, duration) {
		var timeoutDfr = deferred();
		var timeoutFired = false;
		var id = setTimeout(function () {
			timeoutFired = true;
			var result = handler(timeoutDfr);
			pipeResolve(result, timeoutDfr);
		}, duration);
		var oldPromise = this.lastPromise;
		this.lastPromise = timeoutDfr.promise;
		var pipeDfr = function (method) {
			return function (value) {
				if (!timeoutFired) {
					clearTimeout(id);
					method(value);
				}
			};
		};
		oldPromise.then(pipeDfr(timeoutDfr.resolve), pipeDfr(timeoutDfr.reject));
		return this;
	};

	/**
	 * Adds an action that will be executed when the sequence has no
	 * more actions to execute. If actions are added after whenEmpty action
	 * is added but before it is executed they will be executed before.
	 * whenEmpty action will be executed at most once (if actions keep being
	 * added or are not resolved it can starve)
	 * @param  {Function} action   Action to execute if the last action succeed
	 *                             (action(deferred, [args,]) : result)
	 *                             @see Sequence.push() action parameter
	 * @param  {Function} fallback Action to execute if the last action failed
	 *                             (fallback(deferred, [args,]) : result)
	 *                             @see Sequence.push() fallback parameter
	 * @return {Sequence}          current instance to allow chaining
	 */
	Sequence.prototype.whenEmpty = function (action, fallback) {
		var currentPromise = this.lastPromise;
		var self = this;
		var pipeActions = function (func) {
			return function (value) {
				if (self.lastPromise === currentPromise) {
					var nextDeferred = deferred();
					self.lastPromise = nextDeferred.promise;
					var result = func(nextDeferred, value);
					pipeResolve(result, nextDeferred);
				} else {
					currentPromise = self.lastPromise;
					currentPromise.then(pipeActions(action), pipeActions(fallback));
				}
			};
		};
		currentPromise.then(pipeActions(action), pipeActions(fallback));
		return this;
	};

	/**
	 * Returns the promise that will be resolved by the last action currently
	 * in the sequence.
	 * @return {Promise} promise of the last action in the sequence
	 */
	Sequence.prototype.promise = function () {
		return this.lastPromise;
	};

	return Sequence;
}();
