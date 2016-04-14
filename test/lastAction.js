require("jsdom").env("", function(err, window) {
	if (err) {
		console.error(err);
		return;
	}
	var jQuery = require("jquery")(window);
	var LastAction = require('../src/lastAction');
	var QUnit = require('qunitjs');
	var qunitTap = require('qunit-tap');
	qunitTap(QUnit, console.log.bind(console));
	QUnit.config.autorun = false;

	(function($, QUnit) {
		"use strict";

		QUnit.test("lastPromise thenable", function(assert) {
			assert.expect(1);
			var done = assert.async();
			var actions = new LastAction();
			actions.push(function() {
				assert.ok(true, 'action chained');
				done();
				return $.Deferred();
			});
		});

		QUnit.test("Rejected actions don't stop next action", function(assert) {
			assert.expect(2);
			var done = assert.async();
			var actions = new LastAction();
			var firstAction = actions.push(function() {
				return $.Deferred().reject();
			});

			firstAction.then(function() {
				assert.ok(false, 'This action should have called the failure callback');
				return $.Deferred();
			}, function() {
				assert.ok(true, 'failure handle executed');
			});

			actions.push(function() {
				assert.ok(true, 'chained action gets executed');
				return $.Deferred().resolve();
			}).then(function(){
				done();
			});
		});

		QUnit.test("Drop one request", function(assert) {
			assert.expect(1);
			var done = assert.async();
			var actions = new LastAction();
			var resolution = $.Deferred();
			actions.push(function() {
				return resolution;
			});

			actions.push(function() {
				assert.ok(false, 'This action should have been dropped');
				return $.Deferred();
			});

			actions.push(function() {
				assert.ok(true, 'last action gets executed');
				done();
				return $.Deferred();
			});
			resolution.resolve();
		});

		QUnit.test("With retry", function(assert) {
			assert.expect(3);
			var done = assert.async();
			var actions = new LastAction();
			var resolution = $.Deferred();
			actions.push(function() {
				assert.ok(true, 'This action should be executed 3 times');
				return resolution;
			}, 2).then(null, done);
			resolution.reject();
		});

		QUnit.test("With retry on definition", function(assert) {
			assert.expect(2);
			var done = assert.async();
			var actions = new LastAction(null, null, 1);
			var resolution = $.Deferred();
			actions.push(function() {
				assert.ok(true, 'This action should be executed 2 times');
				return resolution;
			}).then(null, done);
			resolution.reject();
		});

		QUnit.test("On error", function(assert) {
			assert.expect(1);
			var done = assert.async();
			var actions = new LastAction(null, function() {
				assert.ok(true, 'On error callback');
			});
			var resolution = $.Deferred();
			actions.push(function() {
				return resolution;
			}).then(null, done);
			resolution.reject();
		});

		QUnit.test("On complete", function(assert) {
			assert.expect(1);
			var done = assert.async();
			var actions = new LastAction(function() {
				assert.ok(true, 'On complete callback');
			});
			var resolution = $.Deferred();
			actions.push(function() {
				return resolution;
			}).then(done);
			resolution.resolve();
		});

		QUnit.test("Chained messages on success", function(assert) {
			assert.expect(1);
			var done = assert.async();
			var actions = new LastAction(function() {
				assert.ok(true, 'On complete callback');
			});
			var resolution = $.Deferred();
			actions.push(function() {
				return resolution;
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
			var resolution = $.Deferred();
			actions.push(function() {
				return resolution;
			});
			actions.push(function(response) {
				assert.strictEqual(response, 'ok', 'Message ok gets through');
				return $.Deferred().reject('fail').promise();
			});
			resolution.resolve('ok');
			actions.push(function(response) {
				assert.strictEqual(response, 'fail', 'Message fail gets through');
				return $.Deferred().resolve('ok2').promise();
			});
		});

		QUnit.test("Chained messages responses 2", function(assert) {
			assert.expect(2);
			var done = assert.async();
			var actions = new LastAction(null, function(response) {
				assert.strictEqual(response, 'fail2', 'Message gets through');
				done();
			});
			var resolution = $.Deferred();
			actions.push(function() {
				return resolution;
			});
			actions.push(function(response) {
				assert.strictEqual(response, 'fail', 'Message ok gets through');
				return $.Deferred().reject('fail2').promise();
			});
			resolution.reject('fail');
		});
		QUnit.load();
	})(jQuery, QUnit);
});
