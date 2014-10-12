(function ($) {
	$.LastRequest = function (requests) {
		return new LastRequestCons(requests);
	};

	var LastRequestCons = function(requests){
		this.requests = requests;
	};

	LastRequestCons.prototype.push = function(request){

	};

	LastRequestCons.prototype.last = function(handler){

	};

	LastRequestCons.prototype.next = function(handler){

	};

	LastRequestCons.prototype.each = function(handler){

	};

	LastRequestCons.prototype.discarded = function(handler){

	};
}(jQuery));