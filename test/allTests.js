var files = ['./lastAction', './orderedPromises', './promiseCache', './sequence'];
var QUnit = require('qunitjs');
require('qunit-tap')(QUnit, console.log.bind(console));
files.forEach(function(file){
	console.log('# file: '+ file);
	require(file);
});
QUnit.load();