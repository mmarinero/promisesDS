var PromisesDS =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = {
		LastAction: __webpack_require__(1),
		OrderedPromises: __webpack_require__(2),
		PromiseCache: __webpack_require__(3),
		Sequence: __webpack_require__(4)
	};


/***/ },
/* 1 */
/***/ function(module, exports) {

	
	module.exports = function() {
		"use strict";
		var noop = function(){};
		/**
		 * The LastAction object accepts actions (functions that return promises) only executing the last
		 * action available and dropping the rest. The object also waits for a executed action to complete before
		 * executing the next one.
		 * Note: This is a only client side solution to ordering actions, more network efficient solutions
		 * can be achieved with server collaboration, sequence numbers, acks...
		 *
		 * @param  {Function}   onComplete     Executes when an action completes successfully and no action is
		 *                                     waiting to be executed
		 * @param  {Function}   onError        Executes when an action fails and no action is
		 *                                     waiting to be executed
		 * @param  {Int}   retries             Number of retries for each action before failing, default: 0
		 * @return {LastAction}                LastAction instance
		 */
		var LastAction = function(onComplete, onError, retries) {
			this.onError = onError || noop;
			this.onComplete = onComplete || noop;
			this.retries = retries || 0;
			this._deferred = null;
			this.lastAction = null;
		};

		/**
		 * Aux function to emulate jQuery deferred functionality
		 * @return {Object} Object with resolve and reject methods and a promise property
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

		/**
		 * Function for DRY, takes an action response and cleans it's deferred
		 * or resolved the next one if exists
		 * @param  {LastAction}   self     Instance
		 * @param  {mixed}   response Action response
		 * @param  {Deferred}   dfr      Action deferred
		 * @param  {Function} callback To call if last Action
		 * @return {mixed}            Chain response
		 */
		var resolver = function(self, response, dfr, callback) {
			if (dfr === self._deferred) {
				self._deferred = null;
				self._lastResponse = response;
				callback(response);
			} else {
				self._deferred.resolve(response);
			}
			return response;
		};

		/**
		 * Function for DRY. Executes an action and calls resolver in case of success or error
		 * @param  {LastAction} self     Instance
		 * @param  {Function} action   action to execute
		 * @param  {Deferred} dfr      Pass along to the resolver
		 * @return {promise}           Filtered after resolver action promise
		 */
		var actionExecuter = function(self, action, dfr) {
			return action().then(function(response) {
				return resolver(self, response, dfr, self.onComplete);
			}, function(response) {
				throw resolver(self, response, dfr, self.onError);
			});
		};

		/**
		 * Recursively handles actions retries, dropping retries if a newer action
		 * is available
		 * @param  {LastAction} self     Instance
		 * @param  {Function} action   Action to execute
		 * @param  {Int} retries   Number of times to retry the action
		 * @param  {Deferred} dfr       Resolved when retries are done
		 * @return {Promise}           Promise that resolves on success or is rejected when out of retries
		 */
		var retrier = function(self, action, retries, dfr){
			push(self, action).then(function(response){
				dfr.resolve(response);
			}, function(response) {
				if (self._deferred === null && retries > 0) {
					retrier(self, action, retries - 1, dfr);
				} else {
					dfr.reject(response);
				}
			});
		};

		/**
		 * Checks if there is an action to wait for and sets self._deferred so when the action
		 * is over this can be triggered. Or executes the action immediately.
		 * @param  {LastAction} self   instance
		 * @param  {Function} action Action to execute
		 * @return {Promise}        Resolves when the actions finishes (if it does)
		 */
		var push = function(self, action) {
			self.lastAction = action;
			var dfr = deferred();
			if (self._deferred) {
				self._deferred = dfr;
				return self._deferred.promise.then(function(response) {
					return actionExecuter(self, action.bind(null, response), dfr);
				});
			} else {
				self._deferred = dfr;
				return actionExecuter(self, action.bind(null, self._lastResponse), dfr);
			}
		};


		LastAction.prototype = {
			/**
			 * Adds an action to be executed if no other action is added before the last one finishes
			 * @param  {Function} action  Function that returns an action, receives a parameter from the lastPromise
			 *                            action executed or null
			 * @param  {Int} retries    Number of retries for this action (overrides the default on the constructor)
			 * @return {Promise}         Promise that resolves if the action is actually executed and resolves.
			 */
			push: function(action, retries) {
				retries = retries === undefined ? this.retries : retries;
				var dfr = deferred();
				retrier(this, action, retries, dfr);
				return dfr.promise;
			},

			/**
			 * Last action that was added to this instance of LastAction or null if no action has been added
			 * @return {Function} action
			 */
			lastAction: function() {
				return this.lastAction;
			}
		};

		return LastAction;
	}();


/***/ },
/* 2 */
/***/ function(module, exports) {

	
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


/***/ },
/* 3 */
/***/ function(module, exports) {

	module.exports = function() {
		"use strict";

		/**
		 * Partial insertion sort function implemented to create a sorted array
		 * of promises to evict on one pass
		 * @param  {array[Promise]} promises set of promises to scan
		 * @param  {int} nEvicted number of promises to return
		 * @param  {string} prop     key name of the counter on the promise
		 * @param  {Boolean} desc     To invert the sort order
		 * @return {array[Promise]}  promises to evict
		 */
		var evictionSort = function(promises, nEvicted, prop, desc){
			desc = Boolean(desc);
			var limit;
			if (promises[0]) {
				limit = promises[0][prop];
			}
			var evicted = [];
			var evictedSize = 0;

			Object.keys(promises).forEach(function(key){
				var promise = promises[key];
				if (desc === (limit <= promise[prop]) || evictedSize < nEvicted) {
					var i = 1;
					var notFilled = i < nEvicted && !evicted[i];
					while (notFilled || (evicted[i] && desc === (evicted[i][prop]) <= promise[prop])) {
						evicted[i - 1] = evicted[i];
						i += 1;
						notFilled = i < nEvicted && !evicted[i];
					}
					evicted[i - 1] = {propKey: key};
					evicted[i - 1][prop] = promise[prop];
					evictedSize += 1;
					limit = evicted[0] ? evicted[0][prop] : limit;
				}
			});
			return evicted;
		};

		/**
		 * Least recent used cache eviction implementation
		 * @see PromiseCache::evict(int)
		 */
		var Lru = (function () {
			var LruCons = function () {
				this.counter = 0;
			};

			LruCons.prototype.init = function (cache) {
				this.cache = cache;
			};


			LruCons.prototype.set = function (_key, promise) {
				promise.lru = 0;
			};

			LruCons.prototype.get = function (_key, promise) {
				this.counter += 1;
				promise.lru = this.counter;
			};

			/**
			 * The evict method is somewhat costly since get a set are
			 * trivial, it finds nEvicted elements in a pass over the cache.
			 * @param  {int} nEvicted number of elements to evict from the cache
			 */
			LruCons.prototype.evict = function (nEvicted) {
				var cache = this.cache;
				var evicted = evictionSort(cache._promises, nEvicted, 'lru');
				Object.keys(evicted).forEach(function (key) {
					cache.remove(evicted[key].propKey);
				});
			};
			return LruCons;
		})();

		/**
		 * Most recent used eviction algorithm
		 * @see PromiseCache::evict()
		 */
		var Mru = (function () {
			var MruCons = function () {
				this.counter = 0;
			};

			MruCons.prototype.init = function (cache) {
				this.cache = cache;
			};

			MruCons.prototype.set = function (_key, promise) {
				promise.mru = 0;
			};

			MruCons.prototype.get = function (_key, promise) {
				this.counter += 1;
				promise.mru = this.counter;
			};

			/**
			 * @see Lru::evict(int)
			 * @param  {int} nEvicted number of elements to evict from the cache
			 */
			MruCons.prototype.evict = function (nEvicted) {
				var cache = this.cache;
				var evicted = evictionSort(cache._promises, nEvicted, 'mru', true);
				Object.keys(evicted).forEach(function (key) {
					cache.remove(evicted[key].propKey);
				});
			};
			return MruCons;
		})();

		/**
		 * Least frequently used eviction algorithm
		 * @see PromiseCache::evict()
		 */
		var Lfu = (function () {

			var LfuCons = function () {};

			LfuCons.prototype.init = function (cache) {
				this.cache = cache;
			};

			LfuCons.prototype.set = function (_key, promise) {
				promise.lfu = 0;
			};

			LfuCons.prototype.get = function (_key, promise) {
				promise.lfu += 1;
			};

			/**
			 * @see Lru::evict(int)
			 * @param  {int} nEvicted number of elements to evict from the cache
			 */
			LfuCons.prototype.evict = function (nEvicted) {
				var cache = this.cache;
				var evicted = evictionSort(cache._promises, nEvicted, 'lfu');
				Object.keys(evicted).forEach(function (key) {
					cache.remove(evicted[key].propKey);
				});
			};
			return LfuCons;
		})();

		/**
		 * Map from algorithms names to classes.
		 * @type {Object}
		 */
		var algorithms = {
			lru: Lru,
			mru: Mru,
			lfu: Lfu
		};

		/**
		 * Aux function to emulate jQuery deferred functionality
		 * @return {Object} Object with resolve and reject methods and a promise property
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

		var noop = function () {};

		/**
		 * The promise cache is a small cache implementation for with some features
		 * to manage promises as failure management and expire time.
		 * It has an eviction interface that decouples the algorithm and offers LRU,
		 * MRU and LFU implementations.
		 * The Deferred objects have a resolve and reject method that manages the underlying promise
		 * @param {Object[key- > promise]} promises Initial set of promises to cache with the keys
		 *                                   present in the object
		 * @param {Object} options {
		 *                          eviction Object|string: eviction algorithm
		 *                              ('lru', 'mru', 'lfu') or object implementing
		 *                              the eviction interface @see PromiseCache::evict(int)
		 *                          capacity int: Cache max number of promises, it will call
		 *                              evict when full
		 *                          evictRate int: Number of promises to evict when the cache
		 *                              is full, it may be more efficient if the eviction algorithm
		 *                              is costly.
		 *                          discarded function(key, promise): optional default function
		 *                              @see PromiseCache::set
		 *                          expireTime int: optional default number of seconds before
		 *                              the promise is removed from the cache
		 *                          fail function(dfr: Deferred, key, promise): optional default
		 *                              function @see PromiseCache::set
		 *                         }
		 */
		var PromiseCache = function (promises, options) {
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
			Object.keys(promises || {}).forEach(function(key){
				self.set(key, promises[key], options);
			});
		};

		/**
		 * Sets a promise in the cache with key and options that override the default versions,
		 * can trigger eviction if capacity is exceeded.
		 * @param {string} key to access the cached promise
		 * @param {Promise} promise Promise to save in the cache
		 * @param {Object} options { This options override the defaults available in the constructor
		 *                          discarded function(key, promise): optional, function to be called
		 *                              when the element is removed from the cache
		 *                          expireTime int: optional, number of seconds before the promise is
		 *                              removed from the cache
		 *                          fail function(dfr: Deferred, key, promise): optional, if present
		 *                              or the default exists a new promise will be created and set in
		 *                              the cache, this promise will be succeed when the original is
		 *                              resolved.
		 *                              If the original promise is rejected the fail function will be
		 *                              called and dfr can be used to resolve or reject the new promise
		 *                              that all the users of the get method have.
		 *                              This allow the setter to centralize error handling and
		 *                              potentially provide transparent retries and recovery procedures
		 *                              for the getters.
		 *                         }
		 */
		PromiseCache.prototype.set = function (key, promise, options) {
			if (promise) options = options || {};
			var self = this;
			var interceptor;
			if (!promise || !promise.then) {
				throw new Error('promise: ' + promise + ' is not a Promise');
			}
			if (!this._promises[key]){
				this.length += 1;
				if (this.capacity < this.length) {
					this.evict(this.evictRate);
				}
			}
			var fail = options.fail || this.fail;
			var promiseObj;
			if (fail) {
				var dfr = deferred();
				interceptor = dfr.promise;
				promiseObj = {
					promise: interceptor
				};
				this._promises[key] = promiseObj;
				promise.then(function (value) {
					dfr.resolve(value);
				}, function () {
					fail(dfr, key, promise);
				});
			} else {
				promiseObj = {
					promise: promise
				};
				this._promises[key] = promiseObj;
				promise.then(null, function () {
					if (self._promises[key] && self._promises[key] === promiseObj) {
						this.remove(key);
					}
				});
			}
			this._promises[key].discarded = options.discarded || this.discarded || noop;
			var expireTime = options.expireTime !== undefined ? options.expireTime : this.expireTime;
			if (expireTime !== undefined) {
				setTimeout(function () {
					if (self._promises[key] && self._promises[key] === promiseObj) {
						self.remove(key);
					}
				}, expireTime);
			}
			this.eviction.set(key, promiseObj, promise, options);
		};

		/**
		 * Remove the key from the cache and calls the discarded callback if it exists, it is called
		 * by the eviction algorithms when clearing the cache.
		 * @param  {string} key cache entry to remove
		 * @return {Promise|undefined} Removed promise or undefined it it doesn't exist
		 */
		PromiseCache.prototype.remove = function (key) {
			var promise = this._promises[key];
			if (promise !== undefined) {
				delete this._promises[key];
				this.length -= 1;
				this.eviction.remove(key, promise);
				promise.discarded(key, promise.promise);
				return promise.promise;
			}
		};

		/**
		 * Retrieves the promise in the cache stored with the key
		 * @param  {string} key cache entry to retrieve
		 * @return {Promise|undefined} Promise stored with the key or undefined if it doesn't exist
		 */
		PromiseCache.prototype.get = function (key) {
			if (this._promises[key]) {
				this.eviction.get(key, this._promises[key]);
				return this._promises[key].promise;
			}
		};

		/**
		 * Object containing all promises in the cache with their keys, the object is an independent
		 *  copy of the internal promises store.
		 * @return {Object} promises
		 */
		PromiseCache.prototype.promises = function () {
			var cleanCopy = {};
			var promises = this._promises;
			Object.keys(promises).forEach(function(key){
				cleanCopy[key] = promises[key].promise;
			});
			return cleanCopy;
		};

		/**
		 * Will remove nEvicted promises from the cache or all if larger than the number of promises
		 * @param  {int} nEvicted number of cache entries to clear
		 */
		PromiseCache.prototype.evict = function (nEvicted) {
			this.eviction.evict(nEvicted);
		};

		return PromiseCache;
	}();


/***/ },
/* 4 */
/***/ function(module, exports) {

	module.exports = function() {
		"use strict";
		/**
		 * Abstracts a sequence of a asynchronous actions, the order of execution of the
		 * different actions is enforced using deferred objects.
		 * The successful completion of an action will trigger the start of the next one.
		 * If an action fails the following actions will fail too until an action with
		 * fallback is found in the queue (the fallback action will be called then).
		 *
		 * Actions consist of a function that receives a Deferred object as its first
		 * parameter and the result of the previous action as the following parameters.
		 *
		 * A Deferred object consists of a resolve and reject methods that manage the underlying
		 * promise
		 *
		 * Actions are pushed using the available methods or using an array when
		 * the sequence is created.
		 * For every push feature there is an object syntax using properties and a
		 * method and parameters syntax. Additional features include pushing promises,
		 * setting timeouts for the sequence to reach a point and executing actions
		 * when the queue is empty.
		 *
		 * @param {array[Object|function]} actions An array with the inital actions to
		 *     execute in the secuence using
		 *     object syntax:
		 *         Function: action to execute. The sequence will continue when it resolves
		 *             its Deferred object.
		 *         {action, fallback}: action and fallback in case of failure of the
		 *             previous action.
		 *         {promise}: promise that will stop the secuence untils it's completed
		 *         {synchronous}: action executed synchronously without the need to resolve
		 *             the deferred object.
		 *         {timeout, duration}: action to execute if the Sequence has not
		 *             reached that point after duration.
		 *         {whenEmpty, fallback}: action to execute when the sequence has no
		 *             pending actionsto execute.
		 */
		var Sequence = function (actions) {
			var self = this;
			this.lastPromise = Promise.resolve();
			if (Array.isArray(actions)) {
				actions.forEach(function (action) {
					self.pushObject(action);
				});
			} else if (actions !== undefined) {
				throw new Error('actions (if passed) must be an array');
			}
		};

		/**
		 * Aux function to emulate jQuery deferred functionality
		 * @return {Object} Object with resolve and reject methods and a promise property
		 */
		var deferred = function() {
			var dfr;
			var promise = new Promise(function(resolve, reject) {
				dfr = {
					resolve: resolve,
					reject: reject
				};
			});
			dfr.promise = promise;
			return dfr;
		};

		/**
		 * Adds an action with object syntax @see Sequence(actions)
		 * @param  {Object} obj action or feature to add to the sequence
		 * @return {Sequence}     current instance to allow chaining
		 */
		Sequence.prototype.pushObject = function (obj) {
			if (obj && obj.call) {
				this.push(obj);
			} else if (obj.action) {
				this.push(obj.action, obj.fallback);
			} else if (obj.timeout) {
				this.setTimeout(obj.timeout, obj.duration);
			} else if (obj.whenEmpty) {
				this.whenEmpty(obj.whenEmpty, obj.fallback);
			} else if (obj.promise) {
				this.pushPromise(obj.promise);
			} else if (obj.synchronous) {
				this.pushSynchronous(obj.synchronous, obj.fallback);
			} else {
				var err = new Error('action not recognized ' + obj);
				err.action = obj;
				throw err;
			}
			return this;
		};

		/**
		 * [private] Pipes the resolveWith and rejectWith of two promises so when the origin
		 * is completed the target completes too. Checks if origin is a promise
		 * @param  {Promise} origin promise to attach the callbacks to pipe the completion
		 * @param  {Deferred} target deferred linked to the origin promise
		 */
		var pipeResolve = function (origin, target) {
			if (origin && origin.then && origin.then.call) {
				origin.then(function (value) {
					target.resolve(value);
				}, function (value) {
					target.reject(value);
				});
			}
		};


		/**
		 * Main method to add actions to the sequence pushes actions at the end of
		 * the sequence that will be executed when all the previous ones are resolved.
		 * The fallback method is called if the previous action failed.
		 * @param  {Function} action   Action to execute
		 *         (action(deferred, [args,]) : result)
		 *         deferred: Deferred object that will trigger the next action if
		 *         completed succesfully or call the next fallback if rejected. The
		 *         arguments passed when resolved will be passed to the next action or
		 *         fallback.
		 *         args: optional arguments sent by the previous action.
		 *         result: optional Deferred that will resolve the action instead of the
		 *         parameter deferred
		 * @param  {Function} fallback Action to execute if the last action failed
		 *         (fallback(deferred, [args,]) : result)
		 *         deferred: Deferred object that will trigger the next action if
		 *         completed succesfully or call the next fallback if rejected. The
		 *         arguments passed when resolved will be passed to the next action or
		 *         fallback.
		 *         args: optional arguments sent by the previous action.
		 *         result: optional Deferred that will resolve the action instead of the
		 *         parameter deferred
		 * @return {Sequence}          current instance to allow chaining
		 */
		Sequence.prototype.push = function (action, fallback) {
			var nextDeferred = deferred();
			var oldPromise = this.lastPromise;
			this.lastPromise = nextDeferred.promise;
			delete nextDeferred.promise;
			oldPromise.then(function (value) {
				var result = action(nextDeferred, value);
				pipeResolve(result, nextDeferred);
			});
			if (fallback) {
				oldPromise.then(null, function (value) {
					var result = fallback(nextDeferred, value);
					pipeResolve(result, nextDeferred);
				});
			} else {
				oldPromise.then(null, function (value) {
					nextDeferred.reject(value);
				});
			}
			return this;
		};


		/**
		 * Pushes a promise into the sequence, the sequence cannot control
		 * the start of the action but guarantees that the next action will not
		 * be executed until all the previous ones and the promise completes
		 * @param  {Promise} promise Promise to introduce in the sequence
		 * @return {Sequence}         current instance to allow chaining
		 */
		Sequence.prototype.pushPromise = function (promise) {
			var oldPromise = this.lastPromise;
			this.push(function (deferred) {
				oldPromise.then(function () {
					promise.then(function (value) {
						deferred.resolve(value);
					}, function (value) {
						deferred.reject(value);
					});
				}, function (value) {
					promise.always(function () {
						deferred.reject(value);
					});
				});
			});
			return this;
		};

		/**
		 * Adds an action and a fallback to be executed synchronously.
		 * The function don't receive a deferred object and they will execute
		 * when the previous action completes and the next action will be triggered
		 * as soon as the function exits.
		 * Synchronous actions cannot stop the execution of the next action.
		 * @param  {Function} action   Action to execute if the previous one completes
		 *         successfully.
		 *         (action([args,]) : result)
		 *         args: optional arguments sent by the previous action.
		 *         result: optional return value sent to the next action
		 * @param  {Function} fallback Action to execute if the previous one fails.
		 *         (fallback([args,]) : result)
		 *         args: optional arguments sent by the previous actions.
		 *         result: optional return value sent to the next action
		 * @return {Sequence}          current instance to allow chaining
		 */
		Sequence.prototype.pushSynchronous = function (action, fallback) {
			this.push(function (deferred, value) {
				var result = action(value);
				deferred.resolve(result);
			}, function (deferred, value) {
				var result = fallback(value);
				deferred.resolve(result);
			});
			return this;
		};

		/**
		 * Sets a timeout at the current position in the sequence if the timeout
		 * expires before the previous action completes the handler will be fired
		 * as if it were a regular action. If the previous action completes before
		 * the timeout expires the next action will be executed and the timeout
		 * handler will never be called.
		 * @param  {Function} handler  Action to execute if the timeout expires
		 *                             (handler(deferred) : result)
		 *                             @see Sequence.push() action parameter
		 * @param  {Int} duration      Milliseconds to wait before triggering
		 *                             the timeout handler
		 * @return {Sequence}          current instance to allow chaining
		 */
		Sequence.prototype.setTimeout = function (handler, duration) {
			var timeoutDfr = deferred();
			var timeoutFired = false;
			var id = setTimeout(function () {
				timeoutFired = true;
				var result = handler(timeoutDfr);
				pipeResolve(result, timeoutDfr);
			}, duration);
			var oldPromise = this.lastPromise;
			this.lastPromise = timeoutDfr.promise;
			var pipeDfr = function (method) {
				return function (value) {
					if (!timeoutFired) {
						clearTimeout(id);
						method(value);
					}
				};
			};
			oldPromise.then(pipeDfr(timeoutDfr.resolve), pipeDfr(timeoutDfr.reject));
			return this;
		};

		/**
		 * Adds an action that will be executed when the sequence has no
		 * more actions to execute. If actions are added after whenEmpty action
		 * is added but before it is executed they will be executed before.
		 * whenEmpty action will be executed at most once (if actions keep being
		 * added or are not resolved it can starve)
		 * @param  {Function} action   Action to execute if the last action succeed
		 *                             (action(deferred, [args,]) : result)
		 *                             @see Sequence.push() action parameter
		 * @param  {Function} fallback Action to execute if the last action failed
		 *                             (fallback(deferred, [args,]) : result)
		 *                             @see Sequence.push() fallback parameter
		 * @return {Sequence}          current instance to allow chaining
		 */
		Sequence.prototype.whenEmpty = function (action, fallback) {
			var currentPromise = this.lastPromise;
			var self = this;
			var pipeActions = function (func) {
				return function (value) {
					if (self.lastPromise === currentPromise) {
						var nextDeferred = deferred();
						self.lastPromise = nextDeferred.promise;
						var result = func(nextDeferred, value);
						pipeResolve(result, nextDeferred);
					} else {
						currentPromise = self.lastPromise;
						currentPromise.then(pipeActions(action), pipeActions(fallback));
					}
				};
			};
			currentPromise.then(pipeActions(action), pipeActions(fallback));
			return this;
		};

		/**
		 * Returns the promise that will be resolved by the last action currently
		 * in the sequence.
		 * @return {Promise} promise of the last action in the sequence
		 */
		Sequence.prototype.promise = function () {
			return this.lastPromise;
		};

		return Sequence;
	}();


/***/ }
/******/ ]);