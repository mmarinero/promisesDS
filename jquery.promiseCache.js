(function ($) {
    "use strict";

    /**
     * Partial insertion sort function implemented to create a sorted array
     * of promises to evict on one pass
     * @param  {array[Promise]} promises set of promises to scan
     * @param  {int} nEvicted number of promises to return
     * @param  {string} prop     key name of the counter on the promise
     * @param  {Boolean} desc     To invert the sort order
     * @return {array[Promise]}  promises to evict
     */
    var evictionSort = function(promises, nEvicted, prop, desc){
        desc = Boolean(desc);
        var limit;
        if (promises[0]) {
            limit = promises[0][prop];
        }
        var evicted = [];
        var evictedSize = 0;
        $.each(promises, function (key, promise) {
            if (desc === (limit <= promise[prop]) || evictedSize < nEvicted) {
                var i = 1;
                var notFilled = i < nEvicted && !evicted[i];
                while (notFilled || (evicted[i] && desc === (evicted[i][prop]) <= promise[prop])) {
                    evicted[i - 1] = evicted[i];
                    i += 1;
                    notFilled = i < nEvicted && !evicted[i];
                }
                evicted[i - 1] = {propKey: key};
                evicted[i - 1][prop] = promise[prop];
                evictedSize += 1;
                limit = evicted[0] ? evicted[0][prop] : limit;
            }
        });
        return evicted;
    };

    /**
     * Least recent used cache eviction implementation
     * @see PromiseCache::evict(int)
     */
    var Lru = (function () {
        var LruCons = function () {
            this.counter = 0;
        };

        LruCons.prototype.init = function (cache) {
            this.cache = cache;
        };


        LruCons.prototype.set = function (key, promise) {
            promise.lru = 0;
        };

        LruCons.prototype.get = function (key, promise) {
            this.counter += 1;
            promise.lru = this.counter;
        };

        /**
         * The evict method is somewhat costly since get a set are
         * trivial, it finds nEvicted elements in a pass over the cache.
         * @TODO Simplify algorithm
         * @param  {int} nEvicted number of elements to evict from the cache
         */
        LruCons.prototype.evict = function (nEvicted) {
            var cache = this.cache;
            var evicted = evictionSort(cache._promises, nEvicted, 'lru');
            $.each(evicted, function (key, obj) {
                cache.remove(obj.propKey);
            });
        };
        return LruCons;
    })();

    /**
     * Most recent used eviction algorithm
     * @see PromiseCache::evict()
     */
    var Mru = (function () {
        var MruCons = function () {
            this.counter = 0;
        };

        MruCons.prototype.init = function (cache) {
            this.cache = cache;
        };

        MruCons.prototype.set = function (key, promise) {
            promise.mru = 0;
        };

        MruCons.prototype.get = function (key, promise) {
            this.counter += 1;
            promise.mru = this.counter;
        };

        /**
         * @see Lru::evict(int)
         * @TODO Simplify algorithm
         * @param  {int} nEvicted number of elements to evict from the cache
         */
        MruCons.prototype.evict = function (nEvicted) {
            var cache = this.cache;
            var evicted = evictionSort(cache._promises, nEvicted, 'mru', true);
            $.each(evicted, function (key, obj) {
                cache.remove(obj.propKey);
            });
        };
        return MruCons;
    })();

    /**
     * Least frequently used eviction algorithm
     * @see PromiseCache::evict()
     */
    var Lfu = (function () {

        var LfuCons = function () {};

        LfuCons.prototype.init = function (cache) {
            this.cache = cache;
        };

        LfuCons.prototype.set = function (key, promise) {
            promise.lfu = 0;
        };

        LfuCons.prototype.get = function (key, promise) {
            promise.lfu += 1;
        };

        /**
         * @see Lru::evict(int)
         * @TODO Simplify algorithm
         * @param  {int} nEvicted number of elements to evict from the cache
         */
        LfuCons.prototype.evict = function (nEvicted) {
            var cache = this.cache;
            var evicted = evictionSort(cache._promises, nEvicted, 'lfu');
            $.each(evicted, function (key, obj) {
                cache.remove(obj.propKey);
            });
        };
        return LfuCons;
    })();

    /**
     * Map from algorithms names to classes.
     * @type {Object}
     */
    var algorithms = {
        lru: Lru,
        mru: Mru,
        lfu: Lfu
    };

    /**
     * The promise cache is a small cache implementation for with some features 
     * to manage promises as failure management and expire time.
     * It has an eviction interface that decouples the algorithm and offers LRU,
     * MRU and LFU implementations.
     * It's based on jQuery Deferred objects
     * @param {Object[key- > promise]} promises Initial set of promises to cache with the keys
     *                                   present in the object
     * @param {Object} options {
     *                          eviction Object|string: eviction algorithm 
     *                              ('lru', 'mru', 'lfu') or object implementing 
     *                              the eviction interface @see PromiseCache::evict(int)
     *                          capacity int: Cache max number of promises, it will call
     *                              evict when full
     *                          evictRate int: Number of promises to evict when the cache
     *                              is full, it may be more efficient if the eviction algorihm
     *                              is costly.
     *                          discarded function(key, promise): optional default function 
     *                              @see PromiseCache::set
     *                          expireTime int: optional default number of seconds before 
     *                              the promise is removed from the cache
     *                          fail function(dfr: Deferred, key, promise): optional default 
     *                              function @see PromiseCache::set
     *                         }
     */
    $.PromiseCache = function (promises, options) {
        return new PromiseCacheCons(promises, options);
    };

    var noop = function () {};

    /**
     * Constructor, initializes the cache and eviction, finally sets
     * the initial set of promises
     * @param {Object[key- > promise]} @see PromiseCache
     * @param {Object} options @see PromiseCache
     */
    var PromiseCacheCons = function (promises, options) {
        options = options || {};
        this._promises = {};
        this.length = 0;

        var eviction;
        if (options.eviction) {
            if (algorithms[options.eviction]) {
                eviction = new algorithms[options.eviction]();
            } else {
                eviction = options.eviction;
            }
        }
        eviction = eviction || {};
        eviction.init = eviction.init || noop;
        eviction.get = eviction.get || noop;
        eviction.set = eviction.set || noop;
        eviction.remove = eviction.remove || noop;
        if (options.capacity === undefined) {
            eviction.evict = eviction.evict || noop;
        } else if (!eviction.evict) {
            throw new Error('There is a capacity but no evict function set');
        }
        this.eviction = eviction;
        this.eviction.init(this, promises, options);
        this.capacity = options.capacity;
        this.evictRate = options.evictRate || 1;
        this.discarded = options.discarded;
        this.expireTime = options.expireTime;
        this.fail = options.fail;
        var self = this;
        $.each(promises || {}, function (key, promise) {
            self.set(key, promise, options);
        });
    };

    /**
     * Sets a promise in the cache with key and options that override the default versions,
     * can trigger eviction if capacity is exceeded.
     * @param {string} key to access the cached promise
     * @param {Promise} promise Promise to save in the cache
     * @param {Object} options { This options override the defaults available in the constructor
     *                          discarded function(key, promise): optional, function to be called 
     *                              when the element is removed from the cache
     *                          expireTime int: optional, number of seconds before the promise is 
     *                              removed from the cache
     *                          fail function(dfr: Deferred, key, promise): optional, if present
     *                              or the default exists a new promise will be created and set in
     *                              the cache, this promise will be succeed when the original is 
     *                              resolved. 
     *                              If the original promise is rejected the fail function will be
     *                              called and dfr can be used to resolve or reject the new promise
     *                              that all the users of the get method have.
     *                              This allow the setter to centralize error handling and 
     *                              potentially provide transparent retries and recovery procedures
     *                              for the getters.
     *                         }
     */
    PromiseCacheCons.prototype.set = function (key, promise, options) {
        if (promise) options = options || {};
        var self = this;
        var interceptor;
        if (!promise || !promise.then) {
            throw new Error('promise: ' + promise + ' is not a Promise');
        }
        if (!this._promises[key]){
          this.length += 1;
          if (this.capacity < this.length) {
              this.evict(this.evictRate);
          }
        }
        var fail = options.fail || this.fail;
        var promiseObj;
        if (fail) {
            var dfr = $.Deferred();
            interceptor = dfr.promise();
            promiseObj = {
                promise: interceptor
            };
            this._promises[key] = promiseObj;
            promise.then(function () {
                dfr.resolveWith(this, arguments);
            }, function () {
                fail(dfr, key, promise);
            });
        } else {
            promiseObj = {
                promise: promise
            };
            this._promises[key] = promiseObj;
            promise.fail(function () {
                if (self._promises[key] && self._promises[key] === promiseObj) {
                    this.remove(key);
                }
            });
        }
        this._promises[key].discarded = options.discarded || this.discarded || noop;
        var expireTime = options.expireTime !== undefined ? options.expireTime : this.expireTime;
        if (expireTime !== undefined) {
            window.setTimeout(function () {
                if (self._promises[key] && self._promises[key] === promiseObj) {
                    self.remove(key);
                }
            }, expireTime);
        }
        this.eviction.set(key, promiseObj, promise, options);
    };

    /**
     * Remove the key from the cache and calls the discarded callback if it exists, it is called
     * by the eviction algorithms when clearing the cache.
     * @param  {string} key cache entry to remove
     * @return {Promise|undefined} Removed promise or undefined it it doesn't exist
     */
    PromiseCacheCons.prototype.remove = function (key) {
        var promise = this._promises[key];
        if (promise !== undefined) {
            delete this._promises[key];
            this.length -= 1;
            this.eviction.remove(key, promise);
            promise.discarded(key, promise.promise);
            return promise.promise;
        }
    };

    /**
     * Retrieves the promise in the cache stored with the key
     * @param  {string} key cache entry to retrieve
     * @return {Promise|undefined} Promise stored with the key or undefined if it doesn't exist
     */
    PromiseCacheCons.prototype.get = function (key) {
        if (this._promises[key]) {
            this.eviction.get(key, this._promises[key]);
            return this._promises[key].promise;
        }
    };

    /**
     * Object containing all promises in the cache with their keys, the object is an independent
     *  copy of the internal promises store.
     * @return {Object} promises
     */
    PromiseCacheCons.prototype.promises = function () {
        var cleanCopy = {};
        $.each(this._promises, function (key, promise) {
            cleanCopy[key] = promise.promise;
        });
        return cleanCopy;
    };

    /**
     * Will remove nEvicted promises from the cache or all if larger than the number of promises
     * @param  {int} nEvicted number of cache entries to clear
     */
    PromiseCacheCons.prototype.evict = function (nEvicted) {
        this.eviction.evict(nEvicted);
    };
}(jQuery));

/**
 * Unit tests
 */
(function () {
    "use strict";
    QUnit.module('Basic');
    QUnit.test("set/get", function (assert) {
        var dfr = $.Deferred();
        assert.equal($.PromiseCache({
            'first': dfr
        }).get('first'), dfr, 'set -> get returns same promise');
        assert.equal($.PromiseCache().get('first'), undefined, 'not set key get returns undefined');
    });

    QUnit.test("change set promise", function (assert) {
        var dfr1 = $.Deferred();
        var dfr2 = $.Deferred();
        var cache = $.PromiseCache({
            'first': dfr1
        });
        assert.strictEqual(cache.get('first'), dfr1, 'first promise match');
        cache.set('first', dfr2);
        assert.strictEqual(cache.get('first'), dfr2, 'second promise match');
    });

    QUnit.test("remove", function (assert) {
        var dfr = $.Deferred();
        var cache = $.PromiseCache({
            'first': dfr
        });
        assert.strictEqual(cache.remove('first'), dfr, 'remove returns promise');
        assert.strictEqual(cache.get('first'), undefined, 'key is no longer in cache after removed');
        assert.strictEqual(cache.remove('second'), undefined, 'not set key returns undefined when removed');
    });

    QUnit.test("promises method", function (assert) {
        var dfr1 = $.Deferred();
        var dfr2 = $.Deferred();
        var promises = {
            'first': dfr1,
                'second': dfr2,
                'third': dfr1
        };
        var cache = $.PromiseCache(promises);
        var cached = cache.promises();
        assert.strictEqual(cached.first, promises.first, '1 promises method returns all promises in cache');
        assert.strictEqual(cached.second, promises.second, '2 promises method returns all promises in cache');
        assert.strictEqual(cached.third, promises.third, '3 promises method returns all promises in cache');
    });

    QUnit.module('Settings');
    QUnit.test("capacity and evict initialization", function (assert) {
        expect(3);
        assert.throws(function () {
            $.PromiseCache({}, {
                capacity: 100
            }, Error, 'capacity requires eviction method');
        });
        $.PromiseCache({}, {
            capacity: 100,
            eviction: {
                evict: function () {
                    assert.ok(true, 'evict called');
                }
            }
        }).evict();
        $.PromiseCache({}, {
            capacity: 100,
            eviction: 'lru'
        });
        assert.ok(true, 'algorithm does not throw');
    });

    QUnit.test("discarded", function (assert) {
        expect(5);
        var dfr = $.Deferred();
        $.PromiseCache({
            'first': dfr
        }, {
            discarded: function (key, promise) {
                assert.strictEqual(key, 'first', 'discarded key ok');
                assert.strictEqual(promise, dfr, 'discarded promise ok');
            }
        }).remove('first');
        var cache = $.PromiseCache(null, {
            discarded: function () {
                throw new Error('I should be overrided');
            }
        });
        cache.set('first', dfr, {
            discarded: function (key, promise) {
                assert.strictEqual(key, 'first', 'discarded key ok');
                assert.strictEqual(promise, dfr, 'discarded promise ok');
            }
        });
        cache.remove('first');
        cache.set('first', dfr);
        assert.throws(function () {
            cache.remove('first');
        });
    });

    QUnit.asyncTest("promise fail interception", function (assert) {
        expect(6);
        var dfr = $.Deferred();
        var dfr2 = $.Deferred().reject();
        var dfr3 = $.Deferred();
        var cache = $.PromiseCache({
            'first': dfr,
                'second': dfr2
        }, {
            fail: function (deferred, key, promise) {
                assert.ok(true, 'fail called');
                if (key === 'first') {
                    assert.strictEqual(promise, dfr, 'fail promise/key ok');
                }
                deferred.resolve();
            }
        });
        dfr.reject();
        cache.get('first').done(function () {
            assert.ok(true, 'resolved');
            cache.set('third', dfr3, {
                fail: function (dfr, key, promise) {
                    assert.ok(true, 'override fail ok');
                    QUnit.start();
                }
            });
            dfr3.reject();
        }).fail(function () {
            assert.ok(false, 'never called');
        });
        cache.get('second').done(function () {
            assert.ok(true, 'resolved');
        });

    });

    QUnit.asyncTest("expireTime method", function (assert) {
        expect(4);
        var dfr = $.Deferred();
        var cache = $.PromiseCache({
            'first': dfr
        }, {
            expireTime: 1,
            discarded: function (key, promise) {
                assert.ok(true, key + ' expired');
            }
        });
        cache.set('second', dfr);
        var millis = Date.now();
        cache.set('third', dfr, {
            expireTime: 10,
            discarded: function (key) {
                var elapsed = Date.now() - millis;
                //8 for tolerance
                assert.ok(elapsed > 8, 'third expireTime override expected >= 10, elapsed: ' + elapsed);
                QUnit.start();
            }
        });
        cache.set('fourth', dfr, {
            expireTime: 5,
            discarded: function (key) {
                var elapsed = Date.now() - millis;
                //8 for tolerance
                assert.ok(elapsed < 8, 'fourth deleted before expire expected immediate removal, elapsed: ' + elapsed);
            }
        });
        cache.remove('fourth');

    });

    QUnit.test("eviction methods", function (assert) {
        expect(5);
        var dfr = $.Deferred();
        var cache = $.PromiseCache(null, {
            eviction: {
                init: function (cache, promises, options) {
                    var check = cache.get && options.eviction && promises === null;
                    assert.ok(check, 'check init parameters');
                },
                set: function (key, promiseObj, promise, options) {
                    var check = key === 'first' && promise === dfr && promiseObj.promise === dfr && options.custom;
                    assert.ok(check, 'check set parameters');
                },
                get: function (key, promise) {
                    var check = key === 'first' && promise.promise === dfr;
                    assert.ok(check, 'check get parameters');
                },
                evict: function (nEvicted) {
                    var check = nEvicted === 3;
                    assert.ok(check, 'check evict parameters');
                },
                remove: function (key, promise) {
                    var check = !cache.promises().first && key === 'first' && promise.promise === dfr;
                    assert.ok(check, 'check remove key already removed and parameters');

                }
            }
        });
        cache.set('first', dfr, {
            custom: true
        });
        cache.get('first');
        cache.get('none'); //no method called
        cache.evict(3);
        cache.remove('first');
    });

    QUnit.module('eviction algorithms');

    var testCache = function () {
        var dfrs = [$.Deferred(), $.Deferred(), $.Deferred(), $.Deferred()];
        return {
            promises: {
                0: dfrs[0],
                1: dfrs[1],
                2: dfrs[2],
                3: dfrs[3]
            },
            options: {
                capacity: 2
            }
        };
    };

    var getSequence = function(cache, getsArray){
      $.each(getsArray, function(i, key){
        cache.get(key);
      });
    };

    QUnit.test("LRU get", function (assert) {
        var ch = testCache();
        ch.options.eviction = 'lru';
        ch.options.capacity = 10;
        var cache = $.PromiseCache(ch.promises, ch.options);
        assert.strictEqual(cache._promises[0].lru, 0, 'After set promise lru 0');
        cache.get(0);
        assert.strictEqual(cache._promises[0].lru, 1, 'After get promise lru 1');
        cache.get(1);
        assert.strictEqual(cache._promises[1].lru, 2, 'After other get promise lru 2');
    });

    QUnit.test("LRU eviction", function (assert) {
        expect(6);
        var ch = testCache();
        var order = 0;
        ch.options.discarded = function (key, promise) {
            switch (order) {
                case 0:
                    assert.equal(key, 1, 'first evicted 1');
                    order++;
                    break;
                case 1:
                    assert.equal(key, 2, 'second evicted 2');
                    order++;
                    break;
                case 2:
                    assert.equal(key, 0, 'third evicted 0');
                    order++;
                    break;
            }
        };
        ch.options.eviction = 'lru';
        var cache = $.PromiseCache(null, ch.options);
        cache.set(0, ch.promises[0]);
        cache.set(1, ch.promises[1]);
        getSequence(cache, [0,1,0]);
        cache.set(2, ch.promises[2]);
        cache.set(3, ch.promises[3]);
        cache.get(3);
        cache.set(1, ch.promises[1]);
        order = 0;
        var ch2 = testCache();
        ch2.options.discarded = ch.options.discarded;
        ch2.options.evictRate = 3;
        ch2.options.capacity = 4;
        ch2.options.eviction = 'lru';
        var cache2 = $.PromiseCache(ch2.promises, ch2.options);
        getSequence(cache2, [0,1,2,1,3,2,1,3,3]);
        cache2.set(5, ch.promises[1]); 
    });

    QUnit.test("MRU get", function (assert) {
        var ch = testCache();
        ch.options.eviction = 'mru';
        ch.options.capacity = 10;
        var cache = $.PromiseCache(ch.promises, ch.options);
        assert.strictEqual(cache._promises[0].mru, 0, 'After set promise mru 0');
        cache.get(0);
        assert.strictEqual(cache._promises[0].mru, 1, 'After get promise mru 1');
    });

    QUnit.test("MRU eviction", function (assert) {
        expect(6);
        var ch = testCache();
        var order = 0;
        ch.options.discarded = function (key, promise) {
            switch (order) {
                case 0:
                    assert.equal(key, 0, 'first evicted 1');
                    order++;
                    break;
                case 1:
                    assert.equal(key, 1, 'second evicted 2');
                    order++;
                    break;
                case 2:
                    assert.equal(key, 3, 'third evicted 0');
                    order++;
                    break;
            }
        };
        ch.options.eviction = 'mru';
        var cache = $.PromiseCache(null, ch.options);
        cache.set(0, ch.promises[0]);
        cache.set(1, ch.promises[1]);
        getSequence(cache, [0,1,0]);
        cache.set(2, ch.promises[2]);
        cache.set(3, ch.promises[3]);
        cache.get(3);
        cache.set(1, ch.promises[1]);
        order = 0;
        var ch2 = testCache();
        ch2.options.discarded = ch.options.discarded;
        ch2.options.evictRate = 3;
        ch2.options.capacity = 4;
        ch2.options.eviction = 'mru';
        var cache2 = $.PromiseCache(ch2.promises, ch2.options);
        getSequence(cache2, [1,2,0,2,3,0,1,3,3]);
        cache2.set(5, ch.promises[1]); 
    });

    QUnit.test("LFU get", function (assert) {
        var ch = testCache();
        ch.options.eviction = 'lfu';
        ch.options.capacity = 10;
        var cache = $.PromiseCache(ch.promises, ch.options);
        assert.strictEqual(cache._promises[0].lfu, 0, 'After set promise lfu 0');
        cache.get(0);
        assert.strictEqual(cache._promises[0].lfu, 1, 'After get promise lfu 1');
    });

    QUnit.test("LFU eviction", function (assert) {
        expect(6);
        var ch = testCache();
        var order = 0;
        ch.options.discarded = function (key, promise) {
            switch (order) {
                case 0:
                    assert.equal(key, 1, 'first evicted 1');
                    order++;
                    break;
                case 1:
                    assert.equal(key, 2, 'second evicted 2');
                    order++;
                    break;
                case 2:
                    assert.equal(key, 3, 'third evicted 0');
                    order++;
                    break;
            }
        };
        ch.options.eviction = 'lfu';
        var cache = $.PromiseCache(null, ch.options);
        cache.set(0, ch.promises[0]);
        cache.set(1, ch.promises[1]);
        getSequence(cache, [0,1,0]);
        cache.set(2, ch.promises[2]);
        cache.set(3, ch.promises[3]);
        cache.get(3);
        cache.set(1, ch.promises[1]);
        order = 0;
        var ch2 = testCache();
        ch2.options.discarded = ch.options.discarded;
        ch2.options.evictRate = 3;
        ch2.options.capacity = 4;
        ch2.options.eviction = 'lfu';
        var cache2 = $.PromiseCache(ch2.promises, ch2.options);
        getSequence(cache2, [3,2,0,2,1,0,0,0,1,1]);
        cache2.set(5, ch.promises[1]); 
    });

})();