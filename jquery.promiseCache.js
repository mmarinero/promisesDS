(function ($) {
"use strict";
	$.PromiseCache = function (promises, options) {
		return new PromiseCacheCons(promises, options);
	};
    
    var Lru = (function(){
        var LruCons = function(){
            this.counter = 0;
        };

        LruCons.prototype.set = function(cache, key, promise){
            promise.lru = 0;
        };
    
        LruCons.prototype.get = function(cache, key, promise){
            this.counter += 1;
            promise.lru = this.counter;
        };

        LruCons.prototype.evict = function(nEvicted){
            var self = this;
            var limit;
            if (cache.promises[0]){
                limit = cache.promises[0].promise.lru -1;
            }
            var evicted = [];
            $.each(cache.promises, function(key, promise) {
                if (limit > promise.lru){
                    var i = 1;
                    while (!evicted[i] || evicted[i].lru > promise.lru){
                        evicted[i-1] = evicted[i];
                        i += 1;
                    }
                    limit = evicted[0].lru;
                    evicted[i] = {lru: promise.lru, lruKey: key};
                }
                promise.lru -= self.counter;
            });
            $.each(evicted, function(key, obj) {
                cache.remove(obj.lruKey);
            });
        };
        return LruCons;
    })();

	var Mru = (function(){
        var MruCons = function(){
            this.counter = 0;
        };

        MruCons.prototype.set = function(cache, key, promise){
            promise.mru = 0;
        };
    
        MruCons.prototype.get = function(cache, key, promise){
            this.counter += 1;
            promise.mru = this.counter;
        };

        MruCons.prototype.evict = function(nEvicted){
            var self = this;
            var limit;
            if (cache.promises[0]){
                limit = cache.promises[0].promise.mru -1;
            }
            var evicted = [];
            $.each(cache.promises, function(key, promise) {
                if (limit < promise.mru){
                    var i = 1;
                    while (!evicted[i] || evicted[i].mru < promise.mru){
                        evicted[i-1] = evicted[i];
                        i += 1;
                    }
                    limit = evicted[0].mru;
                    evicted[i] = {mru: promise.mru, mruKey: key};
                }
                promise.mru -= self.counter;
            });
            $.each(evicted, function(key, obj) {
                cache.remove(obj.mruKey);
            });
            self.counter = 0;
        };
        return MruCons;
    })();
    
    var Lfu = (function(){
        
        var LfuCons = function(){};
    
        LfuCons.prototype.set = function(cache, key, promise){
            promise.lfu = 0;
        };
    
        LfuCons.prototype.get = function(cache, key, promise){
            promise.lfu += 1;
        };
    
        LfuCons.prototype.evict = function(nEvicted){
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
        return LfuCons;
    })();

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
        this.evictRate = options.evictRate || 1;
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
			this.evict(this.evictRate);
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

	PromiseCacheCons.prototype.evict = function(nEvicted){
		this.eviction.evict(this, nEvicted);
	};
}(jQuery));