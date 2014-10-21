(function ($) {
    "use strict";

    var Lru = (function () {
        var LruCons = function () {
            this.counter = 0;
        };

        LruCons.prototype.set = function (cache, key, promise) {
            promise.lru = 0;
        };

        LruCons.prototype.get = function (cache, key, promise) {
            this.counter += 1;
            promise.lru = this.counter;
        };

        LruCons.prototype.evict = function (nEvicted) {
            var self = this;
            var limit;
            if (cache.promises[0]) {
                limit = cache.promises[0].promise.lru - 1;
            }
            var evicted = [];
            $.each(cache.promises, function (key, promise) {
                if (limit > promise.lru) {
                    var i = 1;
                    while (!evicted[i] || evicted[i].lru > promise.lru) {
                        evicted[i - 1] = evicted[i];
                        i += 1;
                    }
                    limit = evicted[0].lru;
                    evicted[i] = {
                        lru: promise.lru,
                        lruKey: key
                    };
                }
                promise.lru -= self.counter;
            });
            $.each(evicted, function (key, obj) {
                cache.remove(obj.lruKey);
            });
        };
        return LruCons;
    })();

    var Mru = (function () {
        var MruCons = function () {
            this.counter = 0;
        };

        MruCons.prototype.set = function (cache, key, promise) {
            promise.mru = 0;
        };

        MruCons.prototype.get = function (cache, key, promise) {
            this.counter += 1;
            promise.mru = this.counter;
        };

        MruCons.prototype.evict = function (nEvicted) {
            var self = this;
            var limit;
            if (cache.promises[0]) {
                limit = cache.promises[0].promise.mru - 1;
            }
            var evicted = [];
            $.each(cache.promises, function (key, promise) {
                if (limit < promise.mru) {
                    var i = 1;
                    while (!evicted[i] || evicted[i].mru < promise.mru) {
                        evicted[i - 1] = evicted[i];
                        i += 1;
                    }
                    limit = evicted[0].mru;
                    evicted[i] = {
                        mru: promise.mru,
                        mruKey: key
                    };
                }
                promise.mru -= self.counter;
            });
            $.each(evicted, function (key, obj) {
                cache.remove(obj.mruKey);
            });
            self.counter = 0;
        };
        return MruCons;
    })();

    var Lfu = (function () {

        var LfuCons = function () {};

        LfuCons.prototype.set = function (cache, key, promise) {
            promise.lfu = 0;
        };

        LfuCons.prototype.get = function (cache, key, promise) {
            promise.lfu += 1;
        };

        LfuCons.prototype.evict = function (nEvicted) {
            var self = this;
            var minCount = 0;
            var lfuKey = null;
            $.each(cache.promises, function (key, promise) {
                if (minCount > promise.lfu) {
                    lfuKey = key;
                    maxCount = promise.lfu;
                }
                promise.lfu -= 1;
            });
            cache.remove(lfuKey);
        };
        return LfuCons;
    })();

    var algorithms = {
        lru: Lru,
        mru: Mru,
        lfu: Lfu
    };

    $.PromiseCache = function (promises, options) {
        return new PromiseCacheCons(promises, options);
    };

    var noop = function () {};

    var PromiseCacheCons = function (promises, options) {
        options = options || {};
        this._promises = {};
        this.expireTime = options.expireTime;
        this.capacity = options.capacity;
        this.length = 0;
        this.discarded = options.discarded;
        this.evictRate = options.evictRate || 1;
        var eviction;
        if (options.eviction) {
            if (algorithms[options.eviction]) {
                eviction = new algorithms[options.eviction]();
            }
            if (!eviction && options.eviction) {
                eviction = options.eviction;
            }
        }
        eviction = eviction || {};
        eviction.init = eviction.init || noop;
        eviction.get = eviction.get || noop;
        eviction.set = eviction.set || noop;
        eviction.remove = eviction.remove || noop;
        if (this.capacity === undefined) {
            eviction.evict = noop;
        } else if (!eviction.evict) {
            throw new Error('There capacity but no evict function set');
        }
        this.eviction = eviction;
        this.eviction.init(this, promises, options);
        var self = this;
        $.each(promises || {}, function (key, promise) {
            self.set(key, promise, options);
        });
    };

    PromiseCacheCons.prototype.set = function (key, promise, options) {
        options = options || {};
        var self = this;
        var interceptor;
        if (!promise.then) {
            throw new Error('promise: ' + promise + ' is not a Promise');
        }
        this.eviction.set(this, key, promise, options);
        this.length += 1;
        if (this.capacity < this.length) {
            this.evict(this.evictRate);
        }
        if (options.fail) {
            var dfr = $.Deferred();
            interceptor = dfr.promise();
            this._promises[key] = {
                promise: interceptor
            };
            promise.then(function () {
                dfr.resolveWith(this, arguments);
            }, function () {
                options.fail(dfr);
            });
        } else {
            this._promises[key] = {
                promise: promise
            };
            promise.fail(function () {
                if (self._promises[key].promise === promise) {
                    this.remove(key);
                }
            });
        }
        this._promises[key].discarded = options.discarded || this.discarded || noop;
        var expireTime = options.expireTime !== undefined ? options.expiretime : this.expireTime;
        if (expireTime !== undefined) {
            window.setTimeout(function () {
                if (this._promises[key].promise === (interceptor || promise)) {
                    delete this._promises[key];
                    this._promises[key].discarded(key, promise);
                }
            }, expireTime);
        }
    };

    PromiseCacheCons.prototype.remove = function (key) {
        var promise = this._promises[key];
        if (promise !== undefined) {
            delete this._promises[key];
            this.length -= 1;
            this.eviction.remove(this, key, promise);
            promise.discarded(key, promise.promise);
            return promise.promise;
        }
    };

    PromiseCacheCons.prototype.get = function (key) {
        this.eviction.get(this, key, this._promises[key]);
        return this._promises[key] ? this._promises[key].promise : undefined;
    };

    PromiseCacheCons.prototype.promises = function () {
        var cleanCopy = {};
        $.each(this._promises, function (key, promise) {
            cleanCopy[key] = promise.promise;
        });
        return cleanCopy;
    };

    PromiseCacheCons.prototype.evict = function (nEvicted) {
        this.eviction.evict(this, nEvicted);
    };
}(jQuery));

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
})();