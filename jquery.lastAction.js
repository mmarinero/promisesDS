(function($) {
    "use strict";
    /**
     * The LastAction object accepts actions (functions that return promises) only executing the last
     * action available and dropping the rest. The object also waits for a executed action to complete before
     * executing the next one.
     * This basic functionality is enhanced by serveral auxiliary methods described below.
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
                self.onError(response);
            }
            return resolution;
        });
    };

    var retrier = function(self, action, discarded, retries, dfr){
        return self.push(action, discarded).then(function(response){
            dfr.resolve(response);
        }, function(response) {
            if (self._deferred === null && retries > 0) {
                retrier(self, action, discarded, retries - 1, dfr);
            } else {
                dfr.reject(response);
            }
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
            var dfr = $.Deferred();
            retrier(this, action, discarded, retries, dfr)
            return dfr.promise();
        },

        unDroppable: function(action){

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
        var actions = $.LastAction();
        actions.push(function() {
            assert.ok(true, 'action chained');
            done();
            return $.Deferred();
        })
    });

    QUnit.test("Rejected actions don't stop next action", function(assert) {
        var done = assert.async();
        var actions = $.LastAction();
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
        var actions = $.LastAction();
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

    QUnit.test("With retry", function(assert) {
        assert.expect(2);
        var done = assert.async();
        var actions = $.LastAction(0, true);
        var resolution = $.Deferred()
        actions.withRetry(function() {
            assert.ok(true, 'This action should be executed 2 times');
            return resolution;
        }, 1).then(null, done);
        resolution.reject();
    });


})();
