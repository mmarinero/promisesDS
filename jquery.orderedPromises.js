(function ($) {
    "use strict";
    $.orderedPromises = function (promises, options) {
        return new OrderedPromisesCons(promises, options);
    };

    var OrderedPromisesCons = function(promises, options){
        var self = this;
        options = options || {};
        promises = promises || [];
        this._promises = [];
        this.next(options.next, options.nextFail);
        this.last(options.last, options.lastFail);
        this.discarded(options.discarded);
        $.each(promises, function(i, promise){
            self.push(promise);
        });
    };

    function find(self, promises, promise, argsObj, success){
        while (promises.length){
            var current = promises.shift();
            if(promise !== current.promise){
                current.discarded = true;
                self._discarded(current.promise);
            } else {
                var args = Array.prototype.slice.call(argsObj);
                args.unshift(promise);
                self[success ? '_next' : '_nextFail'].apply(self, args);
                if (!promises.length){
                    self[success ? '_last' : '_lastFail'].apply(self, args);
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
            this._promises.push(obj);
            promise.then(function(){
                if (!obj.discarded){
                    find(self, self._promises, obj.promise, arguments, true);
                }
            }, function(){
                if (!obj.discarded){
                    find(self, self._promises, obj.promise, arguments, false);
                }
            });
            return this;
        },

        last: function(handler, failure){
            this._last = handler || $.noop;
            this._lastFail = failure || $.noop;
            return this;
        },

        next: function(handler, failure){
            this._next = handler || $.noop;
            this._nextFail = failure || $.noop;
            return this;
        },

        promises: function(handler){
            return $.map(this._promises, function(obj){
                return obj.promise;
            });
        },

        discarded: function(handler){
            this._discarded = handler || $.noop;
            return this;
        }
    };
}(jQuery));

/**
* Unit tests QUnit 1.17
*/
(function () {
    "use strict";

    QUnit.test("next callback", function (assert) {
        var done = assert.async();
        var done2 = assert.async();
        var promises = [$.Deferred(), $.Deferred()];
        var first = true;
        $.orderedPromises(promises).next(function(promise, val){
            if (first){
                assert.equal(val, 'ok', 'next callback called');
                first = false;
                done();
            } else {
                assert.equal(val, 'ok2', 'next callback called');
                done2();
            }
        });
        promises[0].resolve('ok');
        promises[1].resolve('ok2');
    });

    QUnit.test("last callback", function (assert) {
        var done = assert.async();
        var promises = [$.Deferred(), $.Deferred()];
        $.orderedPromises(promises).last(function(promise, val){
            assert.equal(val, 'ok', 'last callback called');
            done();
        });
        promises[1].resolve('ok');
    });

    QUnit.test("discarded callback", function (assert) {
        var done = assert.async();
        var promises = [$.Deferred(), $.Deferred()];
        $.orderedPromises(promises).discarded(function(promise){
            assert.equal(promises[0], promise, 'discarded callback correct');
            done();
        });
        promises[1].resolve();
        promises[0].resolve('bad');
    });

    QUnit.test("push", function (assert) {
        var done = assert.async();
        var promise = $.Deferred();
        $.orderedPromises().push(promise).next(function(promise, val){
            assert.equal(val, 'ok', 'promise was pushed');
            done();
        });
        promise.resolve('ok');
    });

    QUnit.test("promises", function (assert) {
        var pro = [$.Deferred(), $.Deferred()];
        var res = $.orderedPromises(pro).promises();
        assert.ok(pro.length === res.length &&
            pro[0] === res[0] && pro[1] === res[1],
            'promises method returns original promises');
    });

    QUnit.test("config methods", function (assert) {
        assert.expect(3);
        var done = assert.async();
        var done2 = assert.async();
        var done3 = assert.async();
        var promises = [$.Deferred(), $.Deferred()];
        $.orderedPromises(promises, {
            discarded: function(promise){
                assert.equal(promises[0], promise, 'discarded callback correct');
                done();
            },
            next: function(promise, val){
                assert.equal(val, 'ok', 'next callback called');
                done2();
            },
            last: function(promise, val){
                assert.equal(val, 'ok', 'last callback called');
                done3();
            }
        });
        promises[1].resolve('ok');
        promises[0].resolve('bad');
    });

    QUnit.test("long sequence", function (assert) {
        assert.expect(3);
        var done = assert.async();
        var done2 = assert.async();
        var done3 = assert.async();
        var promises = [$.Deferred(), $.Deferred(),
             $.Deferred(), $.Deferred(), $.Deferred()];
         $.orderedPromises(promises, {
             discarded: function(promise){
                 if (promises[0] === promise){
                     assert.ok(true, 'discarded callback correct');
                     done();
                 }
             },
             next: function(promise, val){
                 if (promise === promises[1]){
                     assert.ok(true, 'next callback called');
                     done2();
                 }
             },
             last: function(promise, val){
                 assert.equal(val, 'last', 'last callback called');
                 done3();
             }
         });
         promises[1].resolve('ok');
         promises[4].resolve('last');
    });

})();