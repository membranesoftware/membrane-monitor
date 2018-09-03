// Export all files found in this directory

var Fs = require ('fs');

var files, i, path, m;

files = Fs.readdirSync (__dirname);
for (i = 0; i < files.length; ++i) {
	path = files[i];
	if (path == 'index.js') {
		continue;
	}

	m = path.match (/^(.*)\.js$/);
	if (m == null) {
		continue;
	}

	exports[m[1]] = require ('./' + path);
}
