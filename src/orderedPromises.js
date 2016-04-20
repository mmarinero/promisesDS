
module.exports = function() {
	"use strict";
	/**
	 * The orderedPromises object keeps an ordered list of promises for a single
	 * resource. It provides a next callback that is whenever a more updated
	 * result is available. This guarantees the order of the results preventing
	 * old results getting mixed with newer ones.
	 * The ordering is only kept on the client side so this is ideal for stateless
	 * requests.
	 * @param {array} promises An initial list of promises to track, be careful
	 *                         to initializw the callbacks with options if the promises
	 *                         may have already been completed
	 * @param {Object} options  {
	 *                          	next: @see orderedPromises.next();
	 *                          	last: @see orderedPromises.next();
	 *                          	discarded: @see orderedPromises.next();
	 *                           }
	 */

	var OrderedPromises = function(promises, options){
		var self = this;
		options = options || {};
		promises = promises || [];
		this._promises = [];
		this.next(options.next, options.nextFail);
		this.last(options.last, options.lastFail);
		this.discarded(options.discarded);
		promises.forEach(function(promise){
			self.push(promise);
		});
	};

	/**
	 * Private function to go over the promises array when a new one is completed
	 * and discard old promises and call the next callback and the last callback
	 * if it's the last one
	 * @param  {OrderedPromises} self instance of the object
	 * @param  {[]} promises array of promises
	 * @param  {Promise} promise Promise that has completed
	 * @param  {arguments} argsObj args of the solved promise
	 * @param  {boolean} success if the promise completed successfully
	 */
	function process(self, promises, promise, value, success){
		while (promises.length){
			var current = promises.shift();
			if(promise !== current.promise){
				current.discarded = true;
				self._discarded(current.promise);
			} else {
				self[success ? '_next' : '_nextFail'](promise, value);
				if (!promises.length){
					self[success ? '_last' : '_lastFail'](promise, value);
				}
				return;
			}
		}
	}

	var noop = function(){};

	OrderedPromises.prototype = {
		/**
		 * Add a new promise to the list.
		 * @param  {Promise} promise to add
		 * @return {OrderedPromises} chainable return
		 */
		push: function(promise){
			var self = this;
			var obj = {
				promise: promise,
				discarded: false
			};
			this._promises.push(obj);
			promise.then(function(value){
				if (!obj.discarded){
					process(self, self._promises, obj.promise, value, true);
				}
			}, function(value){
				if (!obj.discarded){
					process(self, self._promises, obj.promise, value, false);
				}
			});
			return this;
		},

		/**
		 * Callback triggered when the last promise in the list is completed
		 * @param  {Function} handler handler for a successfully completed promise
		 *                            @see next for the callback specification
		 * @param  {Function} failure handler for a rejected promise
		 *                          @see last for the callback specification
		 * @return {OrderedPromises} chainable return
		 */
		last: function(handler, failure){
			this._last = handler || noop;
			this._lastFail = failure || noop;
			return this;
		},

		/**
		 * Callback triggered when a more updated result is available, that is, no promise
		 * after this has been completed. Just before this callback is executed the previous
		 * not yet completed promises are discarded.
		 * @param  {Function} handler handler for a successfully completed promise
		 *                            handler(promise, promise_resolved_args...)
		 * @param  {Function} failure handler for a rejected promise
		 *                            handler(promise, promise_rejected_args...)
		 * @return {OrderedPromises} chainable return
		 */
		next: function(handler, failure){
			this._next = handler || noop;
			this._nextFail = failure || noop;
			return this;
		},

		/**
		 * It creates a copy of the promises array currently on the object, it contains
		 * all promises introduced that have not been discarded or completed
		 * @return {[]} array of promises
		 */
		promises: function(){
			return this._promises.map(function(obj){
				return obj.promise;
			});
		},

		/**
		 * Callback for the discarded promises so it's possible to keep track of the
		 * promises that didn't complete before a more updated result was available.
		 * It may be useful to release resources or abort them.
		 * @param  {Function} handler handler(promise)
		 * @return {OrderedPromises} chainable return
		 */
		discarded: function(handler){
			this._discarded = handler || noop;
			return this;
		}
	};

	return OrderedPromises;
}();
