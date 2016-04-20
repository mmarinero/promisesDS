var OrderedPromises = require('../src/orderedPromises');
var QUnit = require('qunitjs');
QUnit.config.autorun = false;

module.exports = QUnit;

/**
 * Aux function to emulate jQuery deferred functionality
 * @return {Object} Object with resolve, reject, then methods and a promise property
 */
var deferred = function(){
	var dfr;
	var promise = new Promise(function(resolve, reject){
		dfr = {
			resolve: resolve,
			reject: reject
		};
	});
	dfr.promise = promise;
	return dfr;
};

(function (QUnit) {
	"use strict";
	QUnit.test("next callback", function (assert) {
		var done = assert.async();
		const deferreds = [deferred(), deferred()];
		const promises = deferreds.map(dfr => dfr.promise);
		var first = true;
		(new OrderedPromises(promises)).next(function(_promise, val){
			if (first){
				assert.equal(val, 'ok', 'next callback called');
				first = false;
			} else {
				assert.equal(val, 'ok2', 'next callback called');
				done();
			}
		});
		deferreds[0].resolve('ok');
		deferreds[1].resolve('ok2');
	});

	QUnit.test("last callback", function (assert) {
		var done = assert.async();
		const deferreds = [deferred(), deferred()];
		const promises = deferreds.map(dfr => dfr.promise);
		(new OrderedPromises(promises)).last(function(_promise, val){
			assert.equal(val, 'ok', 'last callback called');
			done();
		});
		deferreds[1].resolve('ok');
	});

	QUnit.test("discarded callback", function (assert) {
		var done = assert.async();
		const deferreds = [deferred(), deferred()];
		const promises = deferreds.map(dfr => dfr.promise);
		(new OrderedPromises(promises)).discarded(function(promise){
			assert.equal(promises[0], promise, 'discarded callback correct');
			done();
		});
		deferreds[1].resolve();
		deferreds[0].resolve('bad');
	});

	QUnit.test("push", function (assert) {
		var done = assert.async();
		var dfr = deferred();
		(new OrderedPromises()).push(dfr.promise).next(function(_promise, val){
			assert.equal(val, 'ok', 'promise was pushed');
			done();
		});
		dfr.resolve('ok');
	});

	QUnit.test("promises", function (assert) {
		const dfrs = [deferred(), deferred()];
		const pro = dfrs.map(dfr => dfr.promise);
		var res = (new OrderedPromises(pro)).promises();
		assert.ok(pro.length === res.length &&
			pro[0] === res[0] && pro[1] === res[1],
			'promises method returns original promises');
	});

	QUnit.test("config methods", function (assert) {
		assert.expect(3);
		var done = assert.async();
		const deferreds = [deferred(), deferred()];
		const promises = deferreds.map(dfr => dfr.promise);
		new OrderedPromises(promises, {
			discarded: function(promise){
				assert.equal(promises[0], promise, 'discarded callback correct');
			},
			next: function(_promise, val){
				assert.equal(val, 'ok', 'next callback called');
			},
			last: function(_promise, val){
				assert.equal(val, 'ok', 'last callback called');
				done();
			}
		});
		deferreds[1].resolve('ok');
		deferreds[0].resolve('bad');
	});

	QUnit.test("long sequence", function (assert) {
		assert.expect(3);
		const done = assert.async();
		const deferreds = [deferred(), deferred(),
			deferred(), deferred(), deferred()];
		const promises = deferreds.map(dfr => dfr.promise);
		new OrderedPromises(promises, {
			discarded: function(promise){
				if (promises[0] === promise){
					assert.ok(true, 'discarded callback correct');
				}
			},
			next: function(promise){
				if (promise === promises[1]){
					assert.ok(true, 'next callback called');
				}
			},
			last: function(_promise, val){
				assert.equal(val, 'last', 'last callback called');
				done();
			}
		});
		deferreds[1].resolve('ok');
		deferreds[4].resolve('last');
	});
	if (require.main === module){
		require('qunit-tap')(QUnit, console.log.bind(console));
		QUnit.load();
	}
})(QUnit);
