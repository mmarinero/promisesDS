(function ($) {
    $.Sequence = function (actions) {
        return new SequenceCons(actions);
    };

    var SequenceCons = function (actions) {
        var self = this;
        var firstDeferred = $.Deferred().resolve();
        this.lastPromise = firstDeferred.promise();

        if ($.isArray(actions)) {
            $.each(actions, function (i, action) {
                self.push(
                $.isFunction(action) ? action : action.action, action.fallback);
            });
        } else if (actions !== undefined) {
            throw new Error('actions (if passed) must be an array');
        }
        return this.lastPromise;
    };

    SequenceCons.prototype.push = function (action, fallback) {
        var nextDeferred = $.Deferred();
        this.lastPromise.done(function () {
            var args = Array.prototype.slice.call(arguments);
            args.unshift(nextDeferred);
            action.apply(this, args);
        });
        if (fallback) {
            this.lastPromise.fail(function () {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(nextDeferred);
                fallback.apply(this, args);
            });
        } else {
            this.lastPromise.fail(function () {
                nextDeferred.rejectWith(this, arguments);
            });
        }
        this.lastPromise = nextDeferred.promise();
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