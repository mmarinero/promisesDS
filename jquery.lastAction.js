(function($) {
    "use strict";
    /**
     * The LastAction object accepts actions (functions that return promises) only executing the last
     * action available and dropping the rest. The object also waits for a executed action to complete before
     * executing the next one.
     * Note: This is a only client side solution to ordering actions, more network efficient solutions
     * can be achieved with server collaboration, sequence numbers, acks...
     */
    $.LastAction = function(onComplete, onError, retries) {
        return new LastActionCons(onComplete, onError, retries);
    };

    var LastActionCons = function(onComplete, onError, retries) {
        this.onError = onError || $.noop;
        this.onComplete = onComplete || $.noop;
        this.retries = retries;
        this._deferred = null;
        this.lastAction = null;
    };

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

    var actionExecuter = function(self, action, response, dfr) {
        return action(response).then(function(response) {
            return resolver(self, response, dfr, self.onComplete);
        }, function(response) {
            return resolver(self, response, dfr, self.onError);
        });
    };

    var retrier = function(self, action, discarded, retries, dfr){
        return add(self, action, discarded).then(function(response){
            dfr.resolve(response);
        }, function(response) {
            if (self._deferred === null && retries > 0) {
                retrier(self, action, discarded, retries - 1, dfr);
            } else {
                dfr.reject(response);
            }
        });
    };

    var add = function(self, action, discarded) {
        self.lastAction = action;
        if (!discarded) {
            discarded = $.noop;
        }
        var dfr = $.Deferred();
        if (self._deferred) {
            self._deferred = dfr;
            return self._deferred.then(function(response) {
                return actionExecuter(self, action, response, dfr);
            }, discarded);
        } else {
            self._deferred = dfr;
            return actionExecuter(self, action, self._lastResponse, dfr);
        }
    };


    LastActionCons.prototype = {
        /**
         * Add a new action to the list.
         */
        push: function(action, discarded, retries) {
            retries = retries === undefined ? this.retries : retries;
            var dfr = $.Deferred();
            retrier(this, action, discarded, retries, dfr)
            return dfr.promise();
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
        assert.expect(1);
        var done = assert.async();
        var actions = $.LastAction();
        actions.push(function() {
            assert.ok(true, 'action chained');
            done();
            return $.Deferred();
        })
    });

    QUnit.test("Rejected actions don't stop next action", function(assert) {
        assert.expect(2);
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
        assert.expect(1);
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
        assert.expect(3);
        var done = assert.async();
        var actions = $.LastAction();
        var resolution = $.Deferred()
        actions.push(function() {
            assert.ok(true, 'This action should be executed 3 times');
            return resolution;
        }, null, 2).then(null, done);
        resolution.reject();
    });

    QUnit.test("With retry on definition", function(assert) {
        assert.expect(2);
        var done = assert.async();
        var actions = $.LastAction(null, null, 1);
        var resolution = $.Deferred()
        actions.push(function() {
            assert.ok(true, 'This action should be executed 2 times');
            return resolution;
        }).then(null, done);
        resolution.reject();
    });

    QUnit.test("On error", function(assert) {
        assert.expect(1);
        var done = assert.async();
        var actions = $.LastAction(null, function(){
            assert.ok(true, 'On error callback');
        });
        var resolution = $.Deferred()
        actions.push(function() {
            return resolution;
        }).then(null, done);
        resolution.reject();
    });

    QUnit.test("On complete", function(assert) {
        assert.expect(1);
        var done = assert.async();
        var actions = $.LastAction(function(){
            assert.ok(true, 'On complete callback');
        });
        var resolution = $.Deferred()
        actions.push(function() {
            return resolution;
        }).then(done);
        resolution.resolve();
    });

    QUnit.test("Chained messages on success", function(assert) {
        assert.expect(1);
        var done = assert.async();
        var actions = $.LastAction(function(){
            assert.ok(true, 'On complete callback');
        });
        var resolution = $.Deferred()
        actions.push(function() {
            return resolution;
        }).then(done);
        resolution.resolve();
    });

    QUnit.test("Chained messages responses", function(assert) {
        assert.expect(3);
        var done = assert.async();
        var actions = $.LastAction(function(response){
            assert.strictEqual(response, 'ok2', 'Message ok2 gets through');
            done();
        });
        var resolution = $.Deferred()
        actions.push(function() {
            return resolution;
        });
        actions.push(function(response) {
            assert.strictEqual(response, 'ok', 'Message ok gets through');
            return  $.Deferred().reject('fail').promise();
        });
        resolution.resolve('ok');
        actions.push(function(response) {
            assert.strictEqual(response, 'fail', 'Message fail gets through');
            return  $.Deferred().resolve('ok2').promise();
        });
    });

    QUnit.test("Chained messages responses 2", function(assert) {
        assert.expect(2);
        var done = assert.async();
        var actions = $.LastAction(null, function(response){
            assert.strictEqual(response, 'fail2', 'Message gets through');
            done();
        });
        var resolution = $.Deferred()
        actions.push(function() {
            return resolution;
        });
        actions.push(function(response) {
            assert.strictEqual(response, 'fail', 'Message ok gets through');
            return  $.Deferred().reject('fail2').promise();
        });
        resolution.reject('fail');
    });

})();