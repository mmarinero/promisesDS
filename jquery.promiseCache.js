(function ($) {
"use strict";
	$.PromiseCache = function (promises, options) {
		return new PromiseCacheCons(promises, options);
	};

	var Lru = function(){
		this.maxCount = 0;
	};

	Lru.prototype.set = function(cache, key, promise){
		promise.lru = 0;
	};

	Lru.prototype.get = function(cache, key, promise){
		this.maxCount = this.maxCount;
		promise.lru = this.maxCount;
	};

	Lru.prototype.evict = function(){
		var self = this;
		var minCount = 0;
		var lruKey = null;
		$.each(cache.promises, function(key, promise) {
			if (minCount > promise.lru) {
				lruKey = key;
				minCount = promise.lru;
			}
			promise.mru -= self.maxCount;
		});
		this.maxCount = 0;
		cache.remove(lruKey);
	};

	var Mru = function(){
		this.maxCount = 0;
	};

	Mru.prototype.set = function(cache, key, promise){
		promise.mru = 0;
	};

	Mru.prototype.get = function(cache, key, promise){
		this.maxCount += 1;
		promise.mru = this.maxCount;
	};

	Mru.prototype.evict = function(){
		var self = this;
		var maxCount = 0;
		var mruKey = null;
		$.each(cache.promises, function(key, promise) {
			if (maxCount < promise.mru) {
				mruKey = key;
				maxCount = promise.mru;
			}
			promise.mru -= self.maxCount;
		});
		this.maxCount = 0;
		cache.remove(mruKey);
	};

	var Lfu = function(){
	};

	Lfu.prototype.set = function(cache, key, promise){
		promise.lfu = 0;
	};

	Lfu.prototype.get = function(cache, key, promise){
		promise.lfu += 1;
	};

	Lfu.prototype.evict = function(){
		var self = this;
		var minCount = 0;
		var lfuKey = null;
		$.each(cache.promises, function(key, promise) {
			if (minCount > promise.lfu) {
				lfuKey = key;
				maxCount = promise.lfu;
			}
			promise.lfu -= 1;
		});
		cache.remove(lfuKey);
	};

	var algorithms = {
		lru: Lru, 
		mru: Mru, 
		lfu: Lfu
	};

	var PromiseCacheCons = function(promises, options){
		options = options || {};
		this.promises = {};
		this.expireTime = options.expireTime;
		this.capacity = options.capacity;
		this.length = 0;
		this.discarded = options.discarded;
		var eviction;
		
		if (options.eviction){
			if (algorithms[options.eviction]){
				eviction = algorithms[options.eviction];
			}
			if (!eviction && options.eviction.evict){
				eviction = options.eviction;
			}
		}
		eviction.get = eviction.get || function(){};
		eviction.set = eviction.set || function(){};
		eviction.remove = eviction.remove || function(){};

		if (this.capacity === undefined){
			eviction.evict = function(){};	
		} else if (!eviction.evict){
			throw new Error('There is no evict function set');
		}
		this.eviction = eviction;
		this.eviction.init(this, promises, options);

		var self = this;
		$.each(promises, function(key, promise) {
			self.set(key, promise, options);
		});
	};

	PromiseCacheCons.prototype.set = function(key, promise, options){
		options = options || {};
		var self = this;
		var interceptor;
		if (!promise.then) {
			throw new Error('promise is not a Promise');
		}
		eviction.set(this, key, promise, options);
		this.length += 1;
		if (this.capacity < this.length) {
			this.evict();
		}
		if (options.fail){
			var dfr = $.Deferred();
			interceptor = dfr.promise();
			this.promises[key] = {promise: interceptor};
			promise.then(function(){
				dfr.resolveWith(this, arguments);
			},function(){
				options.fail(dfr);
			});
		} else {
			this.promises[key] = {promise: promise};
			promise.fail(function(){
				if (self.promises[key].promise === promise) {
					delete this.promises[key];
				}
			});
		}
		this.promises[key].discarded = options.discarded || this.discarded || function(){};
		var expiretime = expireTime !== undefined ? expiretime : this.expireTime;
		if (expireTime !== undefined) {
			window.setTimeout(function(){
				if (this.promises[key].promise === (interceptor || promise)){
					delete this.promises[key];
					this.promises[key].discarded(key, promise);
				}
			}, expireTime);
		}
	};

	PromiseCacheCons.prototype.remove = function(key){
		var promise = this.promises[key];
		delete this.promises[key];
		if (promise) {
			this.length -= 1;
			this.eviction.remove(this, key, promise);
		}
		this.promises[key].discarded(key, promise);
		return promise;
	};

	PromiseCacheCons.prototype.get = function(key){
		this.eviction.get(this, key, this.promises[key]);
		return this.promises[key].promise;
	};

	PromiseCacheCons.prototype.promises = function(){
		var cleanCopy = {};
		$.each(this.promises, function(key, promise) {
			cleanCopy[key] = promise.promise;
		});
		return cleanCopy;
	};

	PromiseCacheCons.prototype.evict = function(){
		this.eviction.evict(this);
	};
}(jQuery));