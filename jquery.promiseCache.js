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
        this.evictRate = options.evictRate;
        this.discarded = options.discarded;
        this.expireTime = options.expireTime;
        this.fail = options.fail;
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
        var fail = options.fail || this.fail;
        if (fail) {
            var dfr = $.Deferred();
            interceptor = dfr.promise();
            this._promises[key] = {
                promise: interceptor
            };
            promise.then(function () {
                dfr.resolveWith(this, arguments);
            }, function () {
                fail(dfr, key, promise);
            });
        } else {
            this._promises[key] = {
                promise: promise
            };
            promise.fail(function () {
                if (self._promises[key] && self._promises[key].promise === promise) {
                    this.remove(key);
                }
            });
        }
        this._promises[key].discarded = options.discarded || this.discarded || noop;
        var expireTime = options.expireTime !== undefined ? options.expireTime : this.expireTime;
        if (expireTime !== undefined) {
            window.setTimeout(function () {
                if (self._promises[key] && self._promises[key].promise === (interceptor || promise)) {
                    self.remove(key);
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
                set: function (ch, key, promise, options) {
                    var check = ch === cache && key === 'first' && promise === dfr && options.custom;
                    assert.ok(check, 'check set parameters');
                },
                get: function (ch, key, promise) {
                    var check = ch === cache && key === 'first' && promise.promise === dfr;
                    assert.ok(check, 'check get parameters');
                },
                evict: function (ch, nEvicted) {
                    var check = ch === cache && nEvicted === 3;
                    assert.ok(check, 'check evict parameters');
                },
                remove: function (ch, key, promise) {
                    var check = ch === cache && !cache.promises().first && key === 'first' && promise.promise === dfr;
                    assert.ok(check, 'check remove key already removed and parameters');

                }
            }
        });
        cache.set('first', dfr, {custom: true});
        cache.get('first');
        cache.evict(3);
        cache.remove('first');
    });

    QUnit.module('eviction algorithms');
})();