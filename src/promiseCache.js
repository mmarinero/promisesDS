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


        LruCons.prototype.set = function (_key, promise) {
            promise.lru = 0;
        };

        LruCons.prototype.get = function (_key, promise) {
            this.counter += 1;
            promise.lru = this.counter;
        };

        /**
         * The evict method is somewhat costly since get a set are
         * trivial, it finds nEvicted elements in a pass over the cache.
         * @param  {int} nEvicted number of elements to evict from the cache
         */
        LruCons.prototype.evict = function (nEvicted) {
            var cache = this.cache;
            var evicted = evictionSort(cache._promises, nEvicted, 'lru');
            $.each(evicted, function (_key, obj) {
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

        MruCons.prototype.set = function (_key, promise) {
            promise.mru = 0;
        };

        MruCons.prototype.get = function (_key, promise) {
            this.counter += 1;
            promise.mru = this.counter;
        };

        /**
         * @see Lru::evict(int)
         * @param  {int} nEvicted number of elements to evict from the cache
         */
        MruCons.prototype.evict = function (nEvicted) {
            var cache = this.cache;
            var evicted = evictionSort(cache._promises, nEvicted, 'mru', true);
            $.each(evicted, function (_key, obj) {
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

        LfuCons.prototype.set = function (_key, promise) {
            promise.lfu = 0;
        };

        LfuCons.prototype.get = function (_key, promise) {
            promise.lfu += 1;
        };

        /**
         * @see Lru::evict(int)
         * @param  {int} nEvicted number of elements to evict from the cache
         */
        LfuCons.prototype.evict = function (nEvicted) {
            var cache = this.cache;
            var evicted = evictionSort(cache._promises, nEvicted, 'lfu');
            $.each(evicted, function (_key, obj) {
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
