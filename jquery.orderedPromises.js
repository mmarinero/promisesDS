(function ($) {
    "use strict";
    $.orderedPromises = function (promises, options) {
        return new OrderedPromisesCons(promises, options);
    };

    var OrderedPromisesCons = function(promises, options){
        this._promises = promises;
        this.next(options.next, options.nextFail);
        this.last(options.last, options.lastFail);
        this.discarded(options.discarded);
    };

    function find(self, promises, promise, success){
        while (promises.length){
            var current = promises.shift();
            if(promise !== current){
                self._discarded(current);
            } else {
                self[success ? '_next' : '_nextFail'](current);
                if (!promises.length){
                    self[success ? '_last' : '_lastFail'](current);
                }
                return;
            }
        }
    }

    OrderedPromisesCons.prototype = {
        push: function(promise){
            var self = this;
            var obj = {
                promise: promise,
                discarded: false
            };
            promise.then(function(){
                if (!obj.discarded){
                    find(self, self._promises, obj.promise, true);
                }
            }, function(){
                if (!obj.discarded){
                    find(self, self._promises, obj.promise, false);
                }
            });
            this._promises(obj);
        },

        last: function(handler, failure){
            this._last = handler || $.noop();
            this._lastFail = failure || $.noop();
        },

        next: function(handler, failure){
            this._next = handler || $.noop();
            this._nextFail = failure || $.noop();
        },

        promises: function(handler){
            return $.map(this._promises, function(i, obj){
                return obj.promise;
            }).get();
        },

        discarded: function(handler){
            this._discarded = handler || $.noop();
        }
    };
}(jQuery));

/**
* Unit tests
*/
(function () {
    "use strict";

    QUnit.test("next callback", function (assert) {

    });

    QUnit.test("last callback", function (assert) {

    });

    QUnit.test("discarded callback", function (assert) {

    });

    QUnit.test("push", function (assert) {

    });

    QUnit.test("promises", function (assert) {

    });

    QUnit.test("config methods", function (assert) {

    });

    QUnit.test("long sequence", function (assert) {

    });

})();
