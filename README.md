# promisesDS
ES6 Promises data structures and utils

Four classes implementing asynchronous utils using promises, all the methods are documented and the code is quite short. Here is a small description of each class and some examples, the examples are extracted from the tests that provide more use cases.

They are written using ECMAScript 2015 Promises and some other features so es6 shim or corejs are needed to support older browsers but no transpilation is required.

## LastAction
The LastAction object accepts actions (functions that return promises) only executing the last
action available and dropping the rest. The object also waits for a executed action to complete before
executing the next one.
Note: This is a only client side solution to ordering actions, more network efficient solutions
can be achieved with server collaboration, sequence numbers, acks...  

@param  {Function}   onComplete     Executes when an action completes successfully and no action is waiting to be executed  
@param  {Function}   onError        Executes when an action fails and no action is waiting to be executed  
@param  {Int}   retries             Number of retries for each action before failing, default: 0  
@return {LastAction}                LastAction instance  

### Usage

	var actions = new LastAction();
	var resolve;
	var resolution = new Promise(function(r){
	    resolve = r;
	});
	actions.push(function() {
	    console.log('First action always gets executed')
		return resolution;
	});

	actions.push(function() {
		console.log('This action should be dropped');
		return new Promise();
	});

	actions.push(function() {
		assert.ok(true, 'last action gets executed');
		done();
		return new Promise();
	});
	//resolve so two actions have been added
	resolve();

## PromiseCache

The promise cache is a small cache implementation for with some features
to manage promises as failure management and expire time.
It has an eviction interface that decouples the algorithm and offers LRU,
MRU and LFU implementations.
The Deferred objects have a resolve and reject method that manages the underlying promise
@param {Object[key- > promise]} promises Initial set of promises to cache with the keys present in the object
@param {Object} options:
* eviction Object|string: eviction algorithm ('lru', 'mru', 'lfu') or object implementing the eviction interface @see PromiseCache::evict(int)
* capacity int: Cache max number of promises, it will call evict when full
* evictRate int: Number of promises to evict when the cache is full, it may be more efficient if the eviction algorithm is costly.
* discarded function(key, promise): optional default function @see PromiseCache::set
* expireTime int: optional default number of seconds before the promise is removed from the cache
* fail function(dfr: Deferred, key, promise): optional default function @see PromiseCache::set

### Usage
    
    //This demostrates use with jQuery deferred objects which promises are mostly compatible
    //with ES6 Promises 
	var dfr = $.Deferred();
	var dfr2 = $.Deferred().reject();
	var dfr3 = $.Deferred();
	var cache = new PromiseCache({
		'first': dfr,
		'second': dfr2
	}, {
		fail: function (deferred, key, promise) {
			console.log('fail called for first and second cache keys');
			deferred.resolve();
			console.log('The users of cache.get only see it was eventually resolved here');
		}
	});
	//Forces 'first' to fail
	dfr.reject();
	//first is recovered by the fail method
	cache.get('first').then(function () {
		cache.set('third', dfr3, {
			fail: function () {
				console.log('override fail ok');
			}
		});
		//Forces dfr3 fail os the override fail is called.
		dfr3.reject();
	}, function () {
		console.log('The fail method avoid the call to this failure method');
	});
	cache.get('second').then(function () {
		console.log('resolved');
	});

## Sequence

Abstracts a sequence of a asynchronous actions, the order of execution of the
different actions is enforced using deferred objects.
The successful completion of an action will trigger the start of the next one.
If an action fails the following actions will fail too until an action with
fallback is found in the queue (the fallback action will be called then).

Actions consist of a function that receives a Deferred object as its first parameter and the result of the previous action as the following parameters.

A Deferred object consists of a resolve and reject methods that manage the underlying promise

Actions are pushed using the available methods or using an array when
the sequence is created.
For every push feature there is an object syntax using properties and a
method and parameters syntax. Additional features include pushing promises,
setting timeouts for the sequence to reach a point and executing actions
when the queue is empty.

@param {array[Object|function]} actions An array with the inital actions to execute in the secuence using
object syntax:

* Function: action to execute. The sequence will continue when it resolves its Deferred object.
* {action, fallback}: action and fallback in case of failure of the previous action.
* {promise}: promise that will stop the secuence untils it's completed
* {synchronous}: action executed synchronously without the need to resolve the deferred object.* {timeout, duration}: action to execute if the Sequence has not reached that point after duration.
* {whenEmpty, fallback}: action to execute when the sequence has no pending actionsto execute.

### Usage

	var seq = (new Sequence()).push(function (deferred) {
		deferred.resolve();
	}).pushPromise($.Deferred().resolve()).pushSynchronous(function () {
		console.log('executed');
	}).push(function () {
		console.log('never resolved');
	}).setTimeout(function (deferred) {
		deferred.reject('I failed');
	});
	
	seq.promise().then(null, function (message) {
		console.log('chain completed: ' + message);
	});

## OrderedPromises

The orderedPromises object keeps an ordered list of promises for a single
resource. It provides a next callback that is whenever a more updated
result is available. This guarantees the order of the results preventing
old results getting mixed with newer ones.
The ordering is only kept on the client side so this is ideal for stateless
requests.
* @param {array} promises An initial list of promises to track, be careful to initializw the callbacks with options if the promises may have already been completed
* @param {Object} options  {  
  	next: @see orderedPromises.next();  
  	last: @see orderedPromises.next();  
  	discarded: @see orderedPromises.next();  
 }  

### Usage
    //This demostrates use with jQuery deferred objects which promises are mostly compatible
    //with ES6 Promises 
	var promises = [$.Deferred(), $.Deferred(),
		$.Deferred(), $.Deferred(), $.Deferred()];
	new OrderedPromises(promises, {
		discarded: function(promise){
			console.log('Called for promises 0, 2, 3');
		},
		next: function(promise){
			console.log('Called for promises 1, 4');
		},
		last: function(_promise, val){
			console.log('Called for promises 4');
		}
	});
	promises[1].resolve();
	promises[4].resolve();
