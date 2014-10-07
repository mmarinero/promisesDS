(function ($) {
    "use strict";
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
                self.push($.isFunction(action) ? action : action.action, action.fallback);
            });
        } else if (actions !== undefined) {
            throw new Error('actions (if passed) must be an array');
        }
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
    };

    SequenceCons.prototype.pushSynchronous = function (action, fallback) {
        this.push(function (deferred) {
            var result = action.apply(this, shiftArgs(arguments));
            deferred.resolveWith(this, result);
        });
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
    };

    SequenceCons.prototype.promise = function () {
        return this.lastPromise;
    };

    SequenceCons.prototype.whenEmpty = function (action, fallback) {
        var currentPromise = this.lastPromise();
        var self = this;
        var pipeActions = function (func) {
            return function () {
                if (self.lastPromise === currentPromise) {
                    func.apply(this, arguments);
                } else {
                    currentPromise = self.lastPromise;
                    currentPromise.then(
                    pipeActions(action), pipeActions(fallback));
                }
            };
        };
        currentPromise.then(pipeActions(action), pipeActions(fallback));
    };

    SequenceCons.prototype.push = function (action, fallback) {
        var nextDeferred = $.Deferred();
        var oldPromise = this.lastPromise;
        this.lastPromise = nextDeferred.promise();
        oldPromise.done(function () {
            var result = action.apply(this, unshiftArgs(arguments, nextDeferred));
            if (result && $.isFunction(result.then)) {
                nextDeferred = result.promise ? result.promise() : result;
            }
        });
        if (fallback) {
            oldPromise.fail(function () {
                fallback.apply(this, unshiftArgs(arguments, nextDeferred));
            });
        } else {
            oldPromise.fail(function () {
                nextDeferred.rejectWith(this, arguments);
            });
        }
        return this.lastPromise;
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