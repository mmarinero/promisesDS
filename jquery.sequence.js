(function ($) {
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
    $.Sequence = function (actions) {
        return new SequenceCons(actions);
    };

    /**
     * [private] Transforms an arguments 'array' into a proper array without the first element
     * @param  {arguments|array} argsObj arguments object or array 
     * @return {array}         result array
     */
    var shiftArgs = function (argsObj) {
        var args = Array.prototype.slice.call(argsObj);
        args.shift();
        return args;
    };

    /**
     * [private] Transforms an arguments 'array' into a proper array with a new first element
     * @param  {arguments|array} argsObj arguments object or array 
     * @param  {Any} parameter new element of the array
     * @return {[type]}          result array
     */
    var unshiftArgs = function (argsObj, parameter) {
        var args = Array.prototype.slice.call(argsObj);
        args.unshift(parameter);
        return args;
    };

    /**
     * Constructor for the sequence
     * @param {actions} actions @see $.Sequence(actions)
     * @throws {Error} if actions is not an array or pushObject throws for one of the
     *         actions
     */
    var SequenceCons = function (actions) {
        var self = this;
        var firstDeferred = $.Deferred().resolve();
        this.lastPromise = firstDeferred.promise();
        if ($.isArray(actions)) {
            $.each(actions, function (i, action) {
                self.pushObject(action);
            });
        } else if (actions !== undefined) {
            throw new Error('actions (if passed) must be an array');
        }
    };

    /**
     * Adds an action with object syntax @see $.Sequence(actions)
     * @param  {Object} obj action or feature to add to the sequence
     * @return {Sequence}     current instance to allow chaining
     */
    SequenceCons.prototype.pushObject = function (obj) {
        if ($.isFunction(obj)) {
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
        if (origin && $.isFunction(origin.then)) {
            origin.then(function () {
                target.resolveWith(this, arguments);
            }, function () {
                target.rejectWith(this, arguments);
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
    SequenceCons.prototype.push = function (action, fallback) {
        var nextDeferred = $.Deferred();
        var oldPromise = this.lastPromise;
        this.lastPromise = nextDeferred.promise();
        oldPromise.done(function () {
            var result = action.apply(this, unshiftArgs(arguments, nextDeferred));
            pipeResolve(result, nextDeferred);
        });
        if (fallback) {
            oldPromise.fail(function () {
                var result = fallback.apply(this, unshiftArgs(arguments, nextDeferred));
                pipeResolve(result, nextDeferred);
            });
        } else {
            oldPromise.fail(function () {
                nextDeferred.rejectWith(this, arguments);
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
    SequenceCons.prototype.pushPromise = function (promise) {
        var oldPromise = this.lastPromise;
        this.push(function (deferred) {
            oldPromise.then(function () {
                promise.then(function () {
                    deferred.resolveWith(this, arguments);
                }, function () {
                    deferred.rejectWith(this, arguments);
                });
            }, function () {
                var self = this;
                var args = arguments;
                promise.always(function () {
                    deferred.rejectWith(self, args);
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
    SequenceCons.prototype.pushSynchronous = function (action, fallback) {
        this.push(function (deferred) {
            var result = action.apply(this, shiftArgs(arguments));
            deferred.resolveWith(this, result);
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
     *                             (handler(deferred, [args,]) : result) 
     *                             @see Sequence.push() action parameter
     * @param  {Int} duration      Milliseconds to wait before triggering 
     *                             the timeout handler
     * @return {Sequence}          current instance to allow chaining
     */
    SequenceCons.prototype.setTimeout = function (handler, duration) {
        var timeoutDfr = $.Deferred();
        var timeoutFired = false;
        var id = window.setTimeout(function () {
            timeoutFired = true;
            var result = handler(timeoutDfr);
            pipeResolve(result, timeoutDfr);
        }, duration);
        var oldPromise = this.lastPromise;
        this.lastPromise = timeoutDfr.promise();
        var pipeDfr = function (method) {
            return function () {
                if (!timeoutFired) {
                    window.clearTimeout(id);
                    method(this, arguments);
                }
            };
        };
        oldPromise.then(pipeDfr(timeoutDfr.resolveWith), pipeDfr(timeoutDfr.rejectWith));
        return this;
    };

    /**
     * Returns the promise that will be resolved by the last action currently 
     * in the sequence.
     * @return {Promise} promise of the last action in the sequence
     */
    SequenceCons.prototype.promise = function () {
        return this.lastPromise;
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
    SequenceCons.prototype.whenEmpty = function (action, fallback) {
        var currentPromise = this.lastPromise;
        var self = this;
        var pipeActions = function (func) {
            return function () {
                if (self.lastPromise === currentPromise) {
                    var nextDeferred = $.Deferred();
                    self.lastPromise = nextDeferred.promise();
                    var result = func.apply(this, arguments);
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

    /*
     * Basic demostration if the sequence
     */ 
    $.Sequence([function (deferred) {
        console.log('first');
        deferred.reject('Help me, Third Kenobi. You\'re my only hope');
    }, function (deferred) {
        console.log('I\'ll never be called but I don\'t care');
        deferred.resolved();
    }, {
        action: function (deferred) {
            console.log('third: not called');
            deferred.resolve();
        },
        fallback: function (deferred, messageFromPast) {
            console.log('third: I survived the failure');
            console.log('A message!: ' + messageFromPast + ' ...A little too late');
            window.setTimeout(function () {
                console.log('finally solved');
                deferred.resolve();
            }, 1000);
            console.log('third: I\'m yet to be solved');
        }
    }, function (deferred) {
        console.log('everything is fine at last');
        deferred.resolve();
    }]);

    /*
     * Unit tests of the sequence
     */
    QUnit.module('Constructor');
    QUnit.asyncTest("action", function (assert) {
        expect(2);
        var order = false;
        $.Sequence([function (deferred) {
            assert.ok($.isFunction(deferred.resolve), 'deferred object can be resolved');
            order = true;
            deferred.resolve();
        }]).promise().done(function () {
            assert.ok(order, 'action was performed in the correct order');
            QUnit.start();
        });
    });

    QUnit.asyncTest("message", function (assert) {
        expect(1);
        $.Sequence([function (deferred) {
            deferred.resolve('message');
        }, function (deferred, message) {
            assert.equal(message, 'message', 'correct message');
            QUnit.start();
        }]);
    });

    QUnit.asyncTest("fallback", function (assert) {
        expect(2);
        $.Sequence([function (deferred) {
            deferred.reject('message');
        }, {
            action: function () {
                assert.ok(false, 'action cannot be called');
            },
            fallback: function (deferred, message) {
                assert.equal(message, 'message', 'fallback was called after reject with message');
                deferred.resolve();
            }
        }]).promise().done(function () {
            assert.ok(true, 'fallback recovered the action');
            QUnit.start();
        });
    });

    QUnit.asyncTest("cascade rejects", function (assert) {
        expect(1);
        $.Sequence([function (deferred) {
            deferred.reject();
        }, function (deferred) {
            assert.ok(false, 'Never called without fallback');
        }, {
            action: function () {},
            fallback: function (deferred) {
                deferred.resolve();
            }
        }]).promise().done(function () {
            assert.ok(true, 'fallback recovered the action');
            QUnit.start();
        });
    });

    QUnit.asyncTest("return promise", function (assert) {
        expect(1);
        var order = false;
        $.Sequence([function (deferred) {
            return $.Deferred().resolve();
        }]).promise().done(function () {
            assert.ok(true, 'promise was chained');
            QUnit.start();
        });
    });

    QUnit.asyncTest("check async with timeouts", function (assert) {
        expect(3);
        var order = 0;
        $.Sequence([function (deferred) {
            window.setTimeout(function () {
                assert.equal(order, 1, 'second');
                order += 1;
                deferred.resolve();
            }, 10);
            assert.equal(order, 0, 'first');
            order += 1;
        }, function (deferred) {
            window.setTimeout(function () {
                assert.equal(order, 2, 'third');
                deferred.resolve();
            }, 0);
        }]).promise().done(function () {
            QUnit.start();
        });
    });

    QUnit.asyncTest("check async with timeouts", function (assert) {
        expect(3);
        var order = 0;
        $.Sequence([function (deferred) {
            window.setTimeout(function () {
                assert.equal(order, 1, 'second');
                order += 1;
                deferred.resolve();
            }, 10);
            assert.equal(order, 0, 'first');
            order += 1;
        }, function (deferred) {
            window.setTimeout(function () {
                assert.equal(order, 2, 'third');
                deferred.resolve();
            }, 0);
        }]).promise().done(function () {
            QUnit.start();
        });
    });

    QUnit.asyncTest("push promise", function (assert) {
        expect(1);
        $.Sequence([{
            promise: $.Deferred().resolve().promise()
        }]).promise().done(function () {
            assert.ok(true, 'Promise resolved');
            QUnit.start();
        });
    });

    QUnit.asyncTest("timeout fired", function (assert) {
        expect(1);
        $.Sequence([{
            promise: $.Deferred().promise()
        }, {
            timeout: function (deferred) {
                assert.ok(true, 'timeout fired');
                deferred.resolve();
            },
            duration: 4
        }]).promise().done(function () {
            QUnit.start();
        });
    });

    QUnit.asyncTest("timeout doesn't fire", function (assert) {
        expect(1);
        var dfr = $.Deferred();
        $.Sequence([{
            promise: dfr.promise()
        }, {
            timeout: function (deferred) {
                assert.ok(false, 'timeout is never fired');
            },
            duration: 10
        }, function () {
            assert.ok(true, 'next action was executed');
        }]);
        dfr.resolve();
        window.setTimeout(function () {
            QUnit.start();
        }, 20);
    });

    QUnit.asyncTest("synchronous", function (assert) {
        expect(1);
        $.Sequence([{
            synchronous: function () {
                assert.ok(true, 'function was executed');
            }
        }]).promise().done(function () {
            QUnit.start();
        });
    });

    QUnit.asyncTest("when empty", function (assert) {
        expect(1);
        var dfr = $.Deferred();
        var order = false;
        $.Sequence([{
            promise: dfr.promise()
        }, {
            whenEmpty: function (deferred) {
                assert.ok(order, 'after second action');
                QUnit.start();
            }
        }, function (deferred) {
            order = true;
            deferred.resolve();
        }]);
        dfr.resolve();
    });

    QUnit.asyncTest("when empty in order", function (assert) {
        expect(1);
        var order = false;
        $.Sequence([{
            promise: $.Deferred().resolve()
        }, {
            whenEmpty: function (deferred) {
                order = true;
            }
        }, function () {
            assert.ok(order, 'after when empty');
            QUnit.start();
        }]);
    });

    QUnit.asyncTest("when empty action return", function (assert) {
        expect(1);
        $.Sequence([{ whenEmpty: function (deferred) {
                var dfr = $.Deferred();
                window.setTimeout(function () {
                    dfr.resolve();
                }, 20);
                return dfr;
            }
        }, function () {
            assert.ok(true, 'after when empty');
            QUnit.start();
        }]);
    });

    QUnit.module('Methods');

    QUnit.asyncTest("push object", function (assert) {
        expect(1);
        $.Sequence().pushObject({
            action: function (deferred) {
                assert.ok(true, 'action executed');
                deferred.resolve();
            },
            fallback: function () {
                assert.ok(false, 'initial action never calls the fallback');
            }
        }).promise().done(function () {
            QUnit.start();
        });
    });

    QUnit.asyncTest("chain", function (assert) {
        expect(3);
        var seq = $.Sequence().push(function (deferred) {
            deferred.resolve();
        }).pushPromise($.Deferred().resolve()).pushSynchronous(function () {
            assert.ok(true, 'executed');
        }).push(function (deferred) {
            assert.ok(true, 'never resolved');
        }).setTimeout(function (deferred) {
            deferred.reject('I failed');
        });
        seq.promise().fail(function (message) {
            assert.ok(true, 'chain completed' + message);
            QUnit.start();
        });
    });
}(jQuery));