(function ($) {
    "use strict";
    /**
     * The orderedActions object keeps an ordered list of promises that perform actions
     * that need to be executed in order on the server.
     * An action is a function that returns a thenable
     * The object prevents two actions to be executed concurrently allow for retries
     * and also to drop not yet executed actions when a new one arrives.
     * The promises will pipe their first resolved or rejected argument
     *
     * The lastPromise property contains a promise linked to the last added action
     * @param {Int} retries  number of retries to perform before failing. default: 0
     * @param {boolean} drop  drop actions when a newer one is ready (It will drop the retries if the request fails) default: true
     */
    $.OrderedActions = function (retries, drop) {
        if (drop === undefined){
            drop = true;
        }
        if (retries === undefined){
            retries = 0;
        }
        return new OrderedActionsCons(retries, drop);
    };

    var OrderedActionsCons = function(retries, drop){
        this.retries = retries;
        this.drop = drop
        this.lastPromise = $.Deferred().resolve().promise();
    };

    OrderedActionsCons.prototype = {
        /**
         * Add a new action to the list.
         * @param  {retries} Override the number of retries for this action
         */
        push: function(action, retries){
            var self = this;
            if (retries !== 0){
                retries = retries || this.retries;
            }
            var newDfr = $.Deferred();
            var newPromise = newDfr.promise()
            var lastAction = this.lastAction;
            var lastPromise = this.lastPromise
            this.lastAction = action
            this.lastPromise = newPromise;
            this.lastRetries = retries;
            var recursiveAction = function(response, subAction, subRetries){
                var executedAction = subAction(response);
                if (!executedAction.then){
                    throw new Error('All actions have to return thenables, but one returned ' + executedAction);
                }
                executedAction.then(function(response){
                    if (!self.drop || self.lastPromise === newPromise){
                        newDfr.resolve(response);
                    } else {
                        newDfr.reject(response);
                        recursiveAction(response, self.lastAction, self.lastRetries)
                    }
                }, function(response){
                    if (subRetries > 0 && (!self.drop || self.lastPromise === newPromise)){
                        recursiveAction(response, subAction, subRetries - 1);
                    } else {
                        newDfr.reject(response);
                    }
                });
            }
            lastPromise.then(function(response){
                recursiveAction(response, action, retries);
            });
        }
    };
}(jQuery));

/**
* Unit tests QUnit 1.17
*/
(function () {
    "use strict";

    QUnit.test("lastPromise thenable", function (assert) {
        var done = assert.async();
        var actions = $.OrderedActions(0, true);
        actions.push(function(){
            assert.ok(true, 'action chained');
            done();
            return $.Deferred();
        })
    });

    QUnit.test("Drop one request", function (assert) {
        var done = assert.async();
        var actions = $.OrderedActions(0, true);
        var resolution = $.Deferred()
        actions.push(function(){
            return resolution;
        })

        actions.push(function(){
            assert.ok(false, 'dropped action');
            return $.Deferred();
        })

        actions.push(function(){
            assert.ok(true, 'last action gets executed');
            done();
            return $.Deferred();
        })

        resolution.resolve();
    });

    QUnit.test("Chained actions are executed", function (assert) {
        var done = assert.async();
        var actions = $.OrderedActions(0, true);
        actions.push(function(){
            return $.Deferred().resolve();
        })

        actions.push(function(){
            assert.ok(true, 'chained action gets executed');
            done();
            return $.Deferred();
        })
    });

})();