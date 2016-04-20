var LastAction = require('../src/lastAction');
var QUnit = require('qunitjs');
QUnit.config.autorun = false;

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

(function(QUnit) {
	"use strict";

	QUnit.test("Push method", function(assert) {
		assert.expect(1);
		var done = assert.async();
		var actions = new LastAction();
		actions.push(function() {
			assert.ok(true, 'action chained');
			done();
			return Promise.resolve();
		});
	});

	QUnit.test("Rejected actions don't stop next action", function(assert) {
		assert.expect(2);
		var done = assert.async();
		var actions = new LastAction();
		var firstAction = actions.push(function() {
			return Promise.reject();
		});

		firstAction.then(function() {
			assert.ok(false, 'This action should have called the failure callback');
			return new Promise();
		}, function() {
			assert.ok(true, 'failure handle executed');
		});

		actions.push(function() {
			assert.ok(true, 'chained action gets executed');
			return Promise.resolve();
		}).then(function(){
			done();
		});
	});

	QUnit.test("Drop one request", function(assert) {
		assert.expect(1);
		var done = assert.async();
		var actions = new LastAction();
		var resolution = deferred();
		actions.push(function() {
			return resolution.promise;
		});

		actions.push(function() {
			assert.ok(false, 'This action should have been dropped');
			return new Promise();
		});

		actions.push(function() {
			assert.ok(true, 'last action gets executed');
			done();
			return new Promise();
		});
		resolution.resolve();
	});

	QUnit.test("With retry", function(assert) {
		assert.expect(3);
		var done = assert.async();
		var actions = new LastAction();
		var resolution = deferred();
		actions.push(function() {
			assert.ok(true, 'This action should be executed 3 times');
			return resolution.promise;
		}, 2).then(null, done);
		resolution.reject();
	});

	QUnit.test("With retry on definition", function(assert) {
		assert.expect(2);
		var done = assert.async();
		var actions = new LastAction(null, null, 1);
		var resolution = deferred();
		actions.push(function() {
			assert.ok(true, 'This action should be executed 2 times');
			return resolution.promise;
		}).then(null, done);
		resolution.reject();
	});

	QUnit.test("On error", function(assert) {
		assert.expect(1);
		var done = assert.async();
		var actions = new LastAction(null, function() {
			assert.ok(true, 'On error callback');
		});
		var resolution = deferred();
		actions.push(function() {
			return resolution.promise;
		}).then(null, done);
		resolution.reject();
	});

	QUnit.test("On complete", function(assert) {
		assert.expect(1);
		var done = assert.async();
		var actions = new LastAction(function() {
			assert.ok(true, 'On complete callback');
		});
		var resolution = deferred();
		actions.push(function() {
			return resolution.promise;
		}).then(done);
		resolution.resolve();
	});

	QUnit.test("Chained messages on success", function(assert) {
		assert.expect(1);
		var done = assert.async();
		var actions = new LastAction(function() {
			assert.ok(true, 'On complete callback');
		});
		var resolution = deferred();
		actions.push(function() {
			return resolution.promise;
		}).then(done);
		resolution.resolve();
	});

	QUnit.test("Chained messages responses", function(assert) {
		assert.expect(3);
		var done = assert.async();
		var actions = new LastAction(function(response) {
			assert.strictEqual(response, 'ok2', 'Message ok2 gets through');
			done();
		});
		var resolution = deferred();
		actions.push(function() {
			return resolution.promise;
		});
		actions.push(function(response) {
			assert.strictEqual(response, 'ok', 'Message ok gets through');
			return Promise.reject('fail');
		});
		resolution.resolve('ok');
		setTimeout(function(){
			actions.push(function(response) {
				assert.strictEqual(response, 'fail', 'Message fail gets through');
				return Promise.resolve('ok2');
			});
		}, 0);

	});

	QUnit.test("Chained messages responses 2", function(assert) {
		assert.expect(2);
		var done = assert.async();
		var actions = new LastAction(null, function(response) {
			assert.strictEqual(response, 'fail2', 'Message gets through');
			done();
		});
		var resolution = deferred();
		actions.push(function() {
			return resolution.promise;
		});
		actions.push(function(response) {
			assert.strictEqual(response, 'fail', 'Message ok gets through');
			return Promise.reject('fail2');
		});
		resolution.reject('fail');
	});

	if (require.main === module){
		require('qunit-tap')(QUnit, console.log.bind(console));
		QUnit.load();
	}
})(QUnit);
