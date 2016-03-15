module.exports = {
	include: __dirname + '/src',
	entry: './src',
	output: {
		path: 'build',
		filename: 'app.js'
	},
	module: {
		loaders: [{
			test: /\.js$/,
			loader: 'babel',
			query: {
				presets: ['es2015'],
				include: __dirname + '/src',
			}
		}]
	}
};
