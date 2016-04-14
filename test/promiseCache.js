require("jsdom").env("", function(err, window) {
	if (err) {
		console.error(err);
		return;
	}
	var jQuery = require("jquery")(window);
	var PromiseCache = require('../src/promiseCache');
	var QUnit = require('qunitjs');
	var qunitTap = require('qunit-tap');
	qunitTap(QUnit, console.log.bind(console));
	QUnit.config.autorun = false;

    (function ($, QUnit) {
        "use strict";
        QUnit.module('Basic');
        QUnit.test("set/get", function (assert) {
            var dfr = $.Deferred();
            assert.equal((new PromiseCache({
                'first': dfr
            })).get('first'), dfr, 'set -> get returns same promise');
            assert.equal((new PromiseCache()).get('first'), undefined, 'not set key get returns undefined');
        });

        QUnit.test("change set promise", function (assert) {
            var dfr1 = $.Deferred();
            var dfr2 = $.Deferred();
            var cache = new PromiseCache({
                'first': dfr1
            });
            assert.strictEqual(cache.get('first'), dfr1, 'first promise match');
            cache.set('first', dfr2);
            assert.strictEqual(cache.get('first'), dfr2, 'second promise match');
        });

        QUnit.test("remove", function (assert) {
            var dfr = $.Deferred();
            var cache = new PromiseCache({
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
            var cache = new PromiseCache(promises);
            var cached = cache.promises();
            assert.strictEqual(cached.first, promises.first, '1 promises method returns all promises in cache');
            assert.strictEqual(cached.second, promises.second, '2 promises method returns all promises in cache');
            assert.strictEqual(cached.third, promises.third, '3 promises method returns all promises in cache');
        });

        QUnit.module('Settings');
        QUnit.test("capacity and evict initialization", function (assert) {
            assert.expect(3);
            assert.throws(function () {
                new PromiseCache({}, {
                    capacity: 100
                }, Error, 'capacity requires eviction method');
            });
            (new PromiseCache({}, {
                capacity: 100,
                eviction: {
                    evict: function () {
                        assert.ok(true, 'evict called');
                    }
                }
            })).evict();
            new PromiseCache({}, {
                capacity: 100,
                eviction: 'lru'
            });
            assert.ok(true, 'algorithm does not throw');
        });

        QUnit.test("discarded", function (assert) {
            assert.expect(5);
            var dfr = $.Deferred();
            (new PromiseCache({
                'first': dfr
            }, {
                discarded: function (key, promise) {
                    assert.strictEqual(key, 'first', 'discarded key ok');
                    assert.strictEqual(promise, dfr, 'discarded promise ok');
                }
            })).remove('first');
            var cache = new PromiseCache(null, {
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
            assert.expect(6);
            var dfr = $.Deferred();
            var dfr2 = $.Deferred().reject();
            var dfr3 = $.Deferred();
            var cache = new PromiseCache({
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
            cache.get('first').then(function () {
                assert.ok(true, 'resolved');
                cache.set('third', dfr3, {
                    fail: function () {
                        assert.ok(true, 'override fail ok');
                        QUnit.start();
                    }
                });
                dfr3.reject();
            }, function () {
                assert.ok(false, 'never called');
            });
            cache.get('second').then(function () {
                assert.ok(true, 'resolved');
            });

        });

        QUnit.asyncTest("expireTime method", function (assert) {
            assert.expect(4);
            var dfr = $.Deferred();
            var cache = new PromiseCache({
                'first': dfr
            }, {
                expireTime: 1,
                discarded: function (key) {
                    assert.ok(true, key + ' expired');
                }
            });
            cache.set('second', dfr);
            var millis = Date.now();
            cache.set('third', dfr, {
                expireTime: 10,
                discarded: function () {
                    var elapsed = Date.now() - millis;
                    //8 for tolerance
                    assert.ok(elapsed > 8, 'third expireTime override expected >= 10, elapsed: ' + elapsed);
                    QUnit.start();
                }
            });
            cache.set('fourth', dfr, {
                expireTime: 5,
                discarded: function () {
                    var elapsed = Date.now() - millis;
                    //8 for tolerance
                    assert.ok(elapsed < 8, 'fourth deleted before expire expected immediate removal, elapsed: ' + elapsed);
                }
            });
            cache.remove('fourth');

        });

        QUnit.test("eviction methods", function (assert) {
            assert.expect(5);
            var dfr = $.Deferred();
            var cache = new PromiseCache(null, {
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
          $.each(getsArray, function(_i, key){
            cache.get(key);
          });
        };

        QUnit.test("LRU get", function (assert) {
            var ch = testCache();
            ch.options.eviction = 'lru';
            ch.options.capacity = 10;
            var cache = new PromiseCache(ch.promises, ch.options);
            assert.strictEqual(cache._promises[0].lru, 0, 'After set promise lru 0');
            cache.get(0);
            assert.strictEqual(cache._promises[0].lru, 1, 'After get promise lru 1');
            cache.get(1);
            assert.strictEqual(cache._promises[1].lru, 2, 'After other get promise lru 2');
        });

        QUnit.test("LRU eviction", function (assert) {
            assert.expect(6);
            var ch = testCache();
            var order = 0;
            ch.options.discarded = function (key) {
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
            var cache = new PromiseCache(null, ch.options);
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
            var cache2 = new PromiseCache(ch2.promises, ch2.options);
            getSequence(cache2, [0,1,2,1,3,2,1,3,3]);
            cache2.set(5, ch.promises[1]);
        });

        QUnit.test("MRU get", function (assert) {
            var ch = testCache();
            ch.options.eviction = 'mru';
            ch.options.capacity = 10;
            var cache = new PromiseCache(ch.promises, ch.options);
            assert.strictEqual(cache._promises[0].mru, 0, 'After set promise mru 0');
            cache.get(0);
            assert.strictEqual(cache._promises[0].mru, 1, 'After get promise mru 1');
        });

        QUnit.test("MRU eviction", function (assert) {
            assert.expect(6);
            var ch = testCache();
            var order = 0;
            ch.options.discarded = function (key) {
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
            var cache = new PromiseCache(null, ch.options);
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
            var cache2 = new PromiseCache(ch2.promises, ch2.options);
            getSequence(cache2, [1,2,0,2,3,0,1,3,3]);
            cache2.set(5, ch.promises[1]);
        });

        QUnit.test("LFU get", function (assert) {
            var ch = testCache();
            ch.options.eviction = 'lfu';
            ch.options.capacity = 10;
            var cache = new PromiseCache(ch.promises, ch.options);
            assert.strictEqual(cache._promises[0].lfu, 0, 'After set promise lfu 0');
            cache.get(0);
            assert.strictEqual(cache._promises[0].lfu, 1, 'After get promise lfu 1');
        });

        QUnit.test("LFU eviction", function (assert) {
            assert.expect(6);
            var ch = testCache();
            var order = 0;
            ch.options.discarded = function (key) {
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
            var cache = new PromiseCache(null, ch.options);
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
            var cache2 = new PromiseCache(ch2.promises, ch2.options);
            getSequence(cache2, [3,2,0,2,1,0,0,0,1,1]);
            cache2.set(5, ch.promises[1]);
        });
        QUnit.load();
    })(jQuery, QUnit);
});
