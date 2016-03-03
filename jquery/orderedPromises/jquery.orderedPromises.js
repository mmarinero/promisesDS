(function ($) {
    "use strict";
    /**
     * The orderedPromises object keeps an ordered list of promises for a single
     * resource. It provides a next callback that is whenever a more updated
     * result is available. This guarantees the order of the results preventing
     * old results getting mixed with newer ones.
     * The ordering is only kept on the client side so this is ideal for stateless
     * requests.
     * @param {array} promises An initial list of promises to track, be careful
     *                         to initializw the callbacks with options if the promises
     *                         may have already been completed
     * @param {Object} options  {
     *                          	next: @see orderedPromises.next();
     *                          	last: @see orderedPromises.next();
     *                          	discarded: @see orderedPromises.next();
     *                           }
     */
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

    /**
     * Private function to go over the promises array when a new one is completed
     * and discard old promises and call the next callback and the last callback
     * if it's the last one
     * @param  {OrderedPromises} self instance of the object
     * @param  {[]} promises array of promises
     * @param  {Promise} promise Promise that has completed
     * @param  {arguments} argsObj args of the solved promise
     * @param  {boolean} success if the promise completed successfully
     */
    function process(self, promises, promise, argsObj, success){
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
        /**
         * Add a new promise to the list.
         * @param  {Promise} promise to add
         * @return {OrderedPromises} chainable return
         */
        push: function(promise){
            var self = this;
            var obj = {
                promise: promise,
                discarded: false
            };
            this._promises.push(obj);
            promise.then(function(){
                if (!obj.discarded){
                    process(self, self._promises, obj.promise, arguments, true);
                }
            }, function(){
                if (!obj.discarded){
                    process(self, self._promises, obj.promise, arguments, false);
                }
            });
            return this;
        },

        /**
         * Callback triggered when the last promise in the list is completed
         * @param  {Function} handler handler for a successfully completed promise
         *                            @see next for the callback specification
         * @param  {Function} failure handler for a rejected promise
         *                          @see last for the callback specification
         * @return {OrderedPromises} chainable return
         */
        last: function(handler, failure){
            this._last = handler || $.noop;
            this._lastFail = failure || $.noop;
            return this;
        },

        /**
         * Callback triggered when a more updated result is available, that is, no promise
         * after this has been completed. Just before this callback is executed the previous
         * not yet completed promises are discarded.
         * @param  {Function} handler handler for a successfully completed promise
         *                            handler(promise, promise_resolved_args...)
         * @param  {Function} failure handler for a rejected promise
         *                            handler(promise, promise_rejected_args...)
         * @return {OrderedPromises} chainable return
         */
        next: function(handler, failure){
            this._next = handler || $.noop;
            this._nextFail = failure || $.noop;
            return this;
        },

        /**
         * It creates a copy of the promises array currently on the object, it contains
         * all promises introduced that have not been discarded or completed
         * @return {[]} array of promises
         */
        promises: function(){
            return $.map(this._promises, function(obj){
                return obj.promise;
            });
        },

        /**
         * Callback for the discarded promises so it's possible to keep track of the
         * promises that didn't complete before a more updated result was available.
         * It may be useful to release resources or abort them.
         * @param  {Function} handler handler(promise)
         * @return {OrderedPromises} chainable return
         */
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