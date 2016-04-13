require("jsdom").env("", function(err, window) {
	if (err) {
		console.error(err);
		return;
	}
	var jQuery = require("jquery")(window);
	var OrderedPromises = require('../src/orderedPromises');
	var QUnit = require('qunitjs');
	var qunitTap = require('qunit-tap');
	qunitTap(QUnit, console.log.bind(console));
	QUnit.config.autorun = false;

    (function ($, QUnit) {
        "use strict";


        QUnit.test("next callback", function (assert) {
            var done = assert.async();
            var done2 = assert.async();
            var promises = [$.Deferred(), $.Deferred()];
            var first = true;
			(new OrderedPromises(promises)).next(function(_promise, val){
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
            (new OrderedPromises(promises)).last(function(_promise, val){
                assert.equal(val, 'ok', 'last callback called');
                done();
            });
            promises[1].resolve('ok');
        });

        QUnit.test("discarded callback", function (assert) {
            var done = assert.async();
            var promises = [$.Deferred(), $.Deferred()];
            (new OrderedPromises(promises)).discarded(function(promise){
                assert.equal(promises[0], promise, 'discarded callback correct');
                done();
            });
            promises[1].resolve();
            promises[0].resolve('bad');
        });

        QUnit.test("push", function (assert) {
            var done = assert.async();
            var promise = $.Deferred();
            (new OrderedPromises()).push(promise).next(function(_promise, val){
                assert.equal(val, 'ok', 'promise was pushed');
                done();
            });
            promise.resolve('ok');
        });

        QUnit.test("promises", function (assert) {
            var pro = [$.Deferred(), $.Deferred()];
            var res = (new OrderedPromises(pro)).promises();
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
            new OrderedPromises(promises, {
                discarded: function(promise){
                    assert.equal(promises[0], promise, 'discarded callback correct');
                    done();
                },
                next: function(_promise, val){
                    assert.equal(val, 'ok', 'next callback called');
                    done2();
                },
                last: function(_promise, val){
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
            new OrderedPromises(promises, {
                 discarded: function(promise){
                     if (promises[0] === promise){
                         assert.ok(true, 'discarded callback correct');
                         done();
                     }
                 },
                 next: function(promise){
                     if (promise === promises[1]){
                         assert.ok(true, 'next callback called');
                         done2();
                     }
                 },
                 last: function(_promise, val){
                     assert.equal(val, 'last', 'last callback called');
                     done3();
                 }
             });
             promises[1].resolve('ok');
             promises[4].resolve('last');
        });
        QUnit.load();
    })(jQuery, QUnit);
});
