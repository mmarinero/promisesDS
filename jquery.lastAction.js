(function($) {
	"use strict";
	/**
	 * The LastAction object keeps an ordered list of promises that perform actions
	 * that need to be executed in order on the server.
	 * An action is a function that returns a thenable
	 * The object prevents two actions to be executed concurrently allow for retries
	 * and also to drop not yet executed actions when a new one arrives.
	 * The promises will pipe their first resolved or rejected argument
	 * Note: This is a only client side solution to ordering actions, more network efficient solutions
	 * can be achieved with server collaboration, sequence numbers, acks...
	 */
	$.LastAction = function(onError) {
		return new LastActionCons(onError);
	};

	var LastActionCons = function(onError) {
		this.onError = onError || $.noop;
		this._deferred = null;
		this.lastAction = null;
	};

	var resolver = function(self, response, dfr) {
		if (dfr === self._deferred) {
			self._deferred = null;
			self._lastResponse = response;
		} else {
			self._deferred.resolve(response);
		}
		return response;
	};

	var actionExecuter = function(self, action, response, dfr) {
		return action(response).then(function(response) {
			return resolver(self, response, dfr);
		}, function(response) {
			var resolution = resolver(self, response, dfr);
			if (self._deferred === null){
				this.onError(response);
			}
			return resolution;
		});
	};

	LastActionCons.prototype = {
		/**
		 * Add a new action to the list.
		 */
		push: function(action, discarded) {
			this.lastAction = action;
			if (!discarded) {
				discarded = $.noop;
			}
			var self = this;
			var dfr = $.Deferred();
			if (self._deferred) {
				self._deferred.reject();
				self._deferred = dfr;
				return self._deferred.then(function(response) {
					return actionExecuter(self, action, response, dfr);
				}, discarded);
			} else {
				self._deferred = dfr;
				return actionExecuter(self, action, self._lastResponse, dfr);
			}
		},

		withRetry: function(action, retries, discarded) {
			this.push(action, discarded).then(null, function() {
				if (self._deferred === null && retries > 0) {
					this.withRetry(action, retries - 1, discarded);
				}
			});
		},

		lastAction: function() {
			return this.lastAction;
		}
	};
}(jQuery));

/**
 * Unit tests QUnit 1.17
 */
(function() {
	"use strict";

	QUnit.test("lastPromise thenable", function(assert) {
		var done = assert.async();
		var actions = $.LastAction(0, true);
		actions.push(function() {
			assert.ok(true, 'action chained');
			done();
			return $.Deferred();
		})
	});

	QUnit.test("Rejected actions don't stop next action", function(assert) {
		var done = assert.async();
		var actions = $.LastAction(0, true);
		var firstAction = actions.push(function() {
			return $.Deferred().reject();
		});

		firstAction.then(function() {
			assert.ok(false, 'This action should have call the failure callback');
			return $.Deferred();
		}, function() {
			assert.ok(true, 'failure handle executed');
		});

		actions.push(function() {
			assert.ok(true, 'chained action gets executed');
			done();
			return $.Deferred();
		})
	});

	QUnit.test("Drop one request", function(assert) {
		var done = assert.async();
		var actions = $.LastAction(0, true);
		var resolution = $.Deferred()
		actions.push(function() {
			return resolution;
		})

		actions.push(function() {
			assert.ok(false, 'This action should have been dropped');
			return $.Deferred();
		})

		actions.push(function() {
			assert.ok(true, 'last action gets executed');
			done();
			return $.Deferred();
		})
		resolution.resolve();
	});


})();