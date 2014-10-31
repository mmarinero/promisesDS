(function ($) {
    "use strict";

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

        LruCons.prototype.evict = function (nEvicted) {
            var self = this;
            var limit;
            if (this.cache._promises[0]) {
                limit = this.cache._promises[0].lru;
            }
            var evicted = [];
            $.each(this.cache._promises, function (key, promise) {
                if (limit > promise.lru || evicted.length < nEvicted) {
                    var i = 1;
                    while (evicted[i] && evicted[i].lru > promise.lru && i < nEvicted) {
                        evicted[i - 1] = evicted[i];
                        i += 1;
                    }
                    evicted[i - 1] = {
                        lru: promise.lru,
                        lruKey: key
                    };
                    limit = evicted[0].lru;
                }
            });
            $.each(evicted, function (key, obj) {
                self.cache.remove(obj.lruKey);
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
        this.evictRate = options.evictRate || 1;
        this.discarded = options.discarded;
        this.expireTime = options.expireTime;
        this.fail = options.fail;
        var self = this;
        $.each(promises || {}, function (key, promise) {
            self.set(key, promise, options);
        });
    };

    PromiseCacheCons.prototype.set = function (key, promise, options) {
        if (promise) options = options || {};
        var self = this;
        var interceptor;
        if (!promise || !promise.then) {
            throw new Error('promise: ' + promise + ' is not a Promise');
        }
        this.length += 1;
        if (this.capacity < this.length) {
            this.evict(this.evictRate);
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

    PromiseCacheCons.prototype.get = function (key) {
        if (this._promises[key]) {
            this.eviction.get(key, this._promises[key]);
            return this._promises[key].promise;
        }
    };

    PromiseCacheCons.prototype.promises = function () {
        var cleanCopy = {};
        $.each(this._promises, function (key, promise) {
            cleanCopy[key] = promise.promise;
        });
        return cleanCopy;
    };

    PromiseCacheCons.prototype.evict = function (nEvicted) {
        this.eviction.evict(nEvicted);
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

    QUnit.asyncTest("LRU eviction", function (assert) {
        expect(3);
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
                    QUnit.start();
                    break;
            }
        };
        ch.options.eviction = 'lru';
        var cache = $.PromiseCache(null, ch.options);
        cache.set(0, ch.promises[0]);
        cache.set(1, ch.promises[1]);
        cache.get(0);
        cache.get(1);
        cache.get(0);
        cache.set(2, ch.promises[2]);
        cache.set(3, ch.promises[3]);
        cache.get(3);
        cache.set(1, ch.promises[1]);
    });

})();