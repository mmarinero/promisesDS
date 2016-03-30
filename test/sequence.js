require("jsdom").env("", function(err, window) {
	if (err) {
		console.error(err);
		return;
	}
	var jQuery = require("jquery")(window);
	require('../src/sequence')(window, jQuery);
	var QUnit = require('qunitjs');
	var qunitTap = require('qunit-tap');
	qunitTap(QUnit, console.log.bind(console));
	QUnit.config.autorun = false;

    (function ($, QUnit) {
        "use strict";
        QUnit.module('Constructor');
        QUnit.asyncTest("action", function (assert) {
            assert.expect(2);
            var order = false;
            $.Sequence([function (deferred) {
                assert.ok($.isFunction(deferred.resolve), 'deferred object can be resolved');
                order = true;
                deferred.resolve();
            }]).promise().done(function () {
                assert.ok(order, 'action was performed in the correct order');
                QUnit.start();
            });
        });

        QUnit.asyncTest("message", function (assert) {
            assert.expect(1);
            $.Sequence([function (deferred) {
                deferred.resolve('message');
            }, function (_deferred, message) {
                assert.equal(message, 'message', 'correct message');
                QUnit.start();
            }]);
        });

        QUnit.asyncTest("fallback", function (assert) {
            assert.expect(2);
            $.Sequence([function (deferred) {
                deferred.reject('message');
            }, {
                action: function () {
                    assert.ok(false, 'action cannot be called');
                },
                fallback: function (deferred, message) {
                    assert.equal(message, 'message', 'fallback was called after reject with message');
                    deferred.resolve();
                }
            }]).promise().done(function () {
                assert.ok(true, 'fallback recovered the action');
                QUnit.start();
            });
        });

        QUnit.asyncTest("cascade rejects", function (assert) {
            assert.expect(1);
            $.Sequence([function (deferred) {
                deferred.reject();
            }, function () {
                assert.ok(false, 'Never called without fallback');
            }, {
                action: function () {},
                fallback: function (deferred) {
                    deferred.resolve();
                }
            }]).promise().done(function () {
                assert.ok(true, 'fallback recovered the action');
                QUnit.start();
            });
        });

        QUnit.asyncTest("return promise", function (assert) {
            assert.expect(1);
            $.Sequence([function () {
                return $.Deferred().resolve();
            }]).promise().done(function () {
                assert.ok(true, 'promise was chained');
                QUnit.start();
            });
        });

        QUnit.asyncTest("check async with timeouts", function (assert) {
            assert.expect(3);
            var order = 0;
            $.Sequence([function (deferred) {
                window.setTimeout(function () {
                    assert.equal(order, 1, 'second');
                    order += 1;
                    deferred.resolve();
                }, 10);
                assert.equal(order, 0, 'first');
                order += 1;
            }, function (deferred) {
                window.setTimeout(function () {
                    assert.equal(order, 2, 'third');
                    deferred.resolve();
                }, 0);
            }]).promise().done(function () {
                QUnit.start();
            });
        });

        QUnit.asyncTest("check async with timeouts", function (assert) {
            assert.expect(3);
            var order = 0;
            $.Sequence([function (deferred) {
                window.setTimeout(function () {
                    assert.equal(order, 1, 'second');
                    order += 1;
                    deferred.resolve();
                }, 10);
                assert.equal(order, 0, 'first');
                order += 1;
            }, function (deferred) {
                window.setTimeout(function () {
                    assert.equal(order, 2, 'third');
                    deferred.resolve();
                }, 0);
            }]).promise().done(function () {
                QUnit.start();
            });
        });

        QUnit.asyncTest("push promise", function (assert) {
            assert.expect(1);
            $.Sequence([{
                promise: $.Deferred().resolve().promise()
            }]).promise().done(function () {
                assert.ok(true, 'Promise resolved');
                QUnit.start();
            });
        });

        QUnit.asyncTest("timeout fired", function (assert) {
            assert.expect(1);
            $.Sequence([{
                promise: $.Deferred().promise()
            }, {
                timeout: function (deferred) {
                    assert.ok(true, 'timeout fired');
                    deferred.resolve();
                },
                duration: 4
            }]).promise().done(function () {
                QUnit.start();
            });
        });

        QUnit.asyncTest("timeout doesn't fire", function (assert) {
            assert.expect(1);
            var dfr = $.Deferred();
            $.Sequence([{
                promise: dfr.promise()
            }, {
                timeout: function () {
                    assert.ok(false, 'timeout is never fired');
                },
                duration: 10
            }, function () {
                assert.ok(true, 'next action was executed');
            }]);
            dfr.resolve();
            window.setTimeout(function () {
                QUnit.start();
            }, 20);
        });

        QUnit.asyncTest("synchronous", function (assert) {
            assert.expect(1);
            $.Sequence([{
                synchronous: function () {
                    assert.ok(true, 'function was executed');
                }
            }]).promise().done(function () {
                QUnit.start();
            });
        });

        QUnit.asyncTest("when empty", function (assert) {
            assert.expect(1);
            var dfr = $.Deferred();
            var order = false;
            $.Sequence([{
                promise: dfr.promise()
            }, {
                whenEmpty: function () {
                    assert.ok(order, 'after second action');
                    QUnit.start();
                }
            }, function (deferred) {
                order = true;
                deferred.resolve();
            }]);
            dfr.resolve();
        });

        QUnit.asyncTest("when empty in order", function (assert) {
            assert.expect(1);
            var order = false;
            $.Sequence([{
                promise: $.Deferred().resolve()
            }, {
                whenEmpty: function (deferred) {
                    order = true;
                    deferred.resolve();
                }
            }, function () {
                assert.ok(order, 'after when empty');
                QUnit.start();
            }]);
        });

        QUnit.asyncTest("when empty action return", function (assert) {
            assert.expect(1);
            $.Sequence([{ whenEmpty: function () {
                    var dfr = $.Deferred();
                    window.setTimeout(function () {
                        dfr.resolve();
                    }, 20);
                    return dfr;
                }
            }, function () {
                assert.ok(true, 'after when empty');
                QUnit.start();
            }]);
        });

        QUnit.module('Methods');

        QUnit.asyncTest("push object", function (assert) {
            assert.expect(1);
            $.Sequence().pushObject({
                action: function (deferred) {
                    assert.ok(true, 'action executed');
                    deferred.resolve();
                },
                fallback: function () {
                    assert.ok(false, 'initial action never calls the fallback');
                }
            }).promise().done(function () {
                QUnit.start();
            });
        });

        QUnit.asyncTest("chain", function (assert) {
            assert.expect(3);
            var seq = $.Sequence().push(function (deferred) {
                deferred.resolve();
            }).pushPromise($.Deferred().resolve()).pushSynchronous(function () {
                assert.ok(true, 'executed');
            }).push(function () {
                assert.ok(true, 'never resolved');
            }).setTimeout(function (deferred) {
                deferred.reject('I failed');
            });
            seq.promise().fail(function (message) {
                assert.ok(true, 'chain completed' + message);
                QUnit.start();
            });
        });
        QUnit.load();
    })(jQuery, QUnit);
});
