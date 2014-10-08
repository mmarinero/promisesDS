"use strict";
(function ($) {
    $.Sequence = function (actions) {
        return new SequenceCons(actions);
    };

    var shiftArgs = function (argsObj) {
        var args = Array.prototype.slice.call(argsObj);
        args.shift();
        return args;
    };

    var unshiftArgs = function (argsObj, parameter) {
        var args = Array.prototype.slice.call(argsObj);
        args.unshift(parameter);
        return args;
    };

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

    SequenceCons.prototype.pushSynchronous = function (action, fallback) {
        this.push(function (deferred) {
            var result = action.apply(this, shiftArgs(arguments));
            deferred.resolveWith(this, result);
        });
        return this;
    };

    SequenceCons.prototype.setTimeout = function (handler, duration) {
        var timeoutDfr = $.Deferred();
        var timeoutFired = false;
        var id = window.setTimeout(function () {
            timeoutFired = true;
            handler(timeoutDfr);
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

    SequenceCons.prototype.promise = function () {
        return this.lastPromise;
    };

    SequenceCons.prototype.whenEmpty = function (action, fallback) {
        var currentPromise = this.lastPromise;
        var self = this;
        var pipeActions = function (func) {
            return function () {
                if (self.lastPromise === currentPromise) {
                    func.apply(this, arguments);
                } else {
                    currentPromise = self.lastPromise;
                    currentPromise.then(pipeActions(action), pipeActions(fallback));
                }
            };
        };
        currentPromise.then(pipeActions(action), pipeActions(fallback));
        return this;
    };

    var pipeResolve = function (origin, target) {
        if (origin && $.isFunction(origin.then)) {
            origin.then(function () {
                target.resolveWith(this, arguments);
            }, function () {
                target.rejectWith(this, arguments);
            });
        }
    };

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
}(jQuery));

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
        setTimeout(function () {
            console.log('finally solved');
            deferred.resolve();
        }, 1000);
        console.log('third: I\'m yet to be solved');
    }
}, function (deferred) {
    console.log('everything is fine at last');
    deferred.resolve();
}]);

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