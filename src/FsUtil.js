// Filesystem utility functions

var App = global.App || { };
var Fs = require ("fs");
var Os = require ("os");
var Log = require (App.SOURCE_DIRECTORY + "/Log");

// createDirectory - Create a directory if it does not already exist, and invoke the provided callback when complete, with a non-null "err" parameter if an error occurred
function createDirectory (path, callback) {
	Fs.stat (path, dirStatComplete);
	function dirStatComplete (err, stats) {
		if ((err != null) && (err.code != "ENOENT")) {
			callback ("Failed to stat directory \"" + path + "\"");
			return;
		}

		if (stats != null) {
			if (! stats.isDirectory ()) {
				callback ("Path \"" + path + "\" already exists as non-directory");
			}
			else {
				mkdirComplete (null);
			}

			return;
		}

		Fs.mkdir (path, 0o755, mkdirComplete);
	}

	function mkdirComplete (err) {
		if (err != null) {
			if (err.toString ().indexOf ("EEXIST") >= 0) {
				err = null;
			}

			callback (err);
			return;
		}

		callback (null);
	}
}
exports.createDirectory = createDirectory;

// readConfigFile - Synchronously read the contents of the specified configuration file and return an array of objects containing "type" and "params" fields for each the resulting lines. Lines containing only whitespace or beginning with a # character are ignored. Returns null if the file could not be read.
function readConfigFile (filename) {
	var hostname, prefix, suffix, pos, configdata, configs, parts, i, line, lineparts, type, params, j, keyparts;

	pos = filename.lastIndexOf (".");
	if (pos >= 0) {
		hostname = Os.hostname ();
		prefix = filename.substring (0, pos);
		suffix = filename.substring (pos);

		// Check for variations on the "filename-hostname.conf" scheme
		line = prefix + "-" + hostname + suffix;
		if (fileExistsSync (line)) {
			Log.write (Log.NOTICE, "Using host-specific configuration overrides - basePath=" + filename + " overridePath=" + line);
			filename = line;
		}
		else {
			pos = hostname.indexOf (".");
			if (pos >= 0) {
				line = prefix + "-" + hostname.substring (0, pos) + suffix;
				if (fileExistsSync (line)) {
					Log.write (Log.NOTICE, "Using host-specific configuration overrides - basePath=" + filename + " overridePath=" + line);
					filename = line;
				}
			}
		}
	}

	try {
		configdata = Fs.readFileSync (filename, { "encoding" : "UTF8" });
	}
	catch (e) {
		Log.write (Log.ERR, "Failed to open \"" + filename + "\": " + e);
		return (null);
	}

	configs = [ ];
	parts = configdata.split ("\n");
	for (i = 0; i < parts.length; ++i) {
		line = parts[i].trim ();
		if (line.match (/^\s*#/) || line.match (/^\s*$/)) {
			continue;
		}

		type = null;
		params = { };
		lineparts = line.split (",");
		for (j = 0; j < lineparts.length; ++j) {
			if (type === null) {
				type = lineparts[j];
				continue;
			}

			keyparts = lineparts[j].split ("=");
			if (keyparts.length < 2) {
				params[keyparts[0]] = true;
			}
			else {
				params[keyparts[0]] = keyparts[1];
			}
		}

		if (type == null) {
			Log.write (Log.WARNING, "Invalid configuration line in file \"" + filename + "\" (no type value): " + line);
			continue;
		}

		configs.push ({ type : type, params : params });
	}

	Log.write (Log.INFO, "Read configuration - path=" + filename);
	return (configs);
}
exports.readConfigFile = readConfigFile;

// readConfigKeyFile - Synchronously read the contents of the specified key-value pair configuration file and return an object containing the resulting fields. Lines containing only whitespace or beginning with a # character are ignored. Returns null if the file could not be read.
function readConfigKeyFile (filename) {
	var hostname, prefix, suffix, pos, configdata, parts, i, line, pos, config;

	pos = filename.lastIndexOf (".");
	if (pos >= 0) {
		hostname = Os.hostname ();
		prefix = filename.substring (0, pos);
		suffix = filename.substring (pos);

		// Check for variations on the "filename-hostname.conf" scheme
		line = prefix + "-" + hostname + suffix;
		if (fileExistsSync (line)) {
			Log.write (Log.NOTICE, "Using host-specific configuration overrides - basePath=" + filename + " overridePath=" + line);
			filename = line;
		}
		else {
			pos = hostname.indexOf (".");
			if (pos >= 0) {
				line = prefix + "-" + hostname.substring (0, pos) + suffix;
				if (fileExistsSync (line)) {
					Log.write (Log.NOTICE, "Using host-specific configuration overrides - basePath=" + filename + " overridePath=" + line);
					filename = line;
				}
			}
		}
	}

	try {
		configdata = Fs.readFileSync (filename, { "encoding" : "UTF8" });
	}
	catch (e) {
		Log.write (Log.ERR, "Failed to open \"" + filename + "\": " + e);
		return (null);
	}

	config = { };
	parts = configdata.split ("\n");
	for (i = 0; i < parts.length; ++i) {
		line = parts[i].trim ();
		if (line.match (/^\s*#/) || line.match (/^\s*$/)) {
			continue;
		}

		pos = line.indexOf (" ");
		if (pos < 0) {
			config[line] = "";
		}
		else {
			config[line.substring (0, pos)] = line.substring (pos + 1);
		}
	}

	Log.write (Log.INFO, "Read configuration - path=" + filename);
	return (config);
}
exports.readConfigKeyFile = readConfigKeyFile;

// getSizeString - Return a size string for the provided number of bytes
function getSizeString (size) {
	var val;

	if (size > (1024 * 1024 * 1024)) {
		val = size / (1024 * 1024 * 1024);
		return (val.toFixed (2) + "GB");
	}

	if (size > (1024 * 1024)) {
		val = size / (1024 * 1024);
		return (val.toFixed (2) + "MB");
	}

	if (size > 1024) {
		val = size / (1024 * 1024);
		return (val.toFixed (2) + "kB");
	}

	return (size + "B");
}
exports.getSizeString = getSizeString;

// writeStateFile - Write a state object to a file and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred)
function writeStateFile (filename, state, callback) {
	Fs.writeFile (filename, JSON.stringify (state), { "mode" : 0o600 }, writeComplete);
	function writeComplete (err) {
		if (err != null) {
			callback (err);
			return;
		}

		callback (null);
	}
}
exports.writeStateFile = writeStateFile;

// readStateFile - Read a previously written state object file and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred) and a "state" parameter (an object containing state data, might be null if the state file was non-existent)
function readStateFile (filename, callback) {
	Fs.readFile (filename, readFileComplete);
	function readFileComplete (err, data) {
		var state;

		if (err != null) {
			if ((err.code == "ENOENT") || (err.code == "ENOTDIR")) {
				err = null;
			}
			callback (err, null);
			return;
		}

		state = null;
		try {
			state = JSON.parse (data.toString ());
		}
		catch (e) {
			state = null;
		}

		callback (null, state);
	}
}
exports.readStateFile = readStateFile;

// removeAllFiles - Remove all files in the specified directory and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred)
function removeAllFiles (directoryPath, callback) {
	var fileindex, filenames, curfile;

	Fs.readdir (directoryPath, readdirComplete);
	function readdirComplete (err, files) {
		if (err != null) {
			callback (err);
			return;
		}

		filenames = files;
		fileindex = 0;
		checkNextFile ();
	}

	function checkNextFile () {
		if (fileindex >= filenames.length) {
			callback (null);
			return;
		}

		curfile = directoryPath + "/" + filenames[fileindex];
		Fs.stat (curfile, statComplete);
	}

	function statComplete (err, stats) {
		if (err != null) {
			callback (err);
			return;
		}

		if (! stats.isFile ()) {
			++fileindex;
			checkNextFile ();
			return;
		}

		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG2, "FsUtil.removeAllFiles; Remove file: " + curfile);
		}
		Fs.unlink (curfile, unlinkComplete);
	}

	function unlinkComplete (err) {
		if (err != null) {
			callback (err);
			return;
		}

		++fileindex;
		checkNextFile ();
	}
}
exports.removeAllFiles = removeAllFiles;

// removeDirectory - Remove the specified directory, recursing through all contained files and subdirectories, and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred)
function removeDirectory (directoryPath, callback) {
	var fileindex, filenames, curfile;

	Fs.readdir (directoryPath, readdirComplete);
	function readdirComplete (err, files) {
		if (err != null) {
			callback (err);
			return;
		}

		filenames = files;
		fileindex = 0;
		checkNextFile ();
	}

	function checkNextFile () {
		if (fileindex >= filenames.length) {
			endCheckFiles ();
			return;
		}

		curfile = directoryPath + "/" + filenames[fileindex];
		Fs.stat (curfile, statComplete);
	}

	function statComplete (err, stats) {
		if (err != null) {
			callback (err);
			return;
		}

		if (stats.isDirectory ()) {
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG2, "FsUtil.removeDirectory; Remove directory: " + curfile);
			}
			removeDirectory (curfile, removeComplete);
			return;
		}

		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG2, "FsUtil.removeDirectory; Remove file: " + curfile);
		}
		Fs.unlink (curfile, removeComplete);
	}

	function removeComplete (err) {
		if (err != null) {
			callback (err);
			return;
		}

		++fileindex;
		checkNextFile ();
	}

	function endCheckFiles () {
		Fs.rmdir (directoryPath, rmdirComplete);
	}

	function rmdirComplete (err) {
		if (err != null) {
			callback (err);
			return;
		}

		callback ();
	}
}
exports.removeDirectory = removeDirectory;

// findFiles - Scan the specified directory path and recurse into all subdirectories to find available filenames. Invokes the provided callback with err and filename parameters for each file found; a callback with a null filename parameter indicates that no more files are available.
function findFiles (directoryPath, callback) {
	var fileindex, filenames, curfile;

	Fs.readdir (directoryPath, readdirComplete);
	function readdirComplete (err, files) {
		if (err != null) {
			callback (err, null);
			return;
		}

		filenames = files;
		fileindex = 0;
		checkNextFile ();
	}

	function checkNextFile () {
		if (fileindex >= filenames.length) {
			callback (null, null);
			return;
		}

		curfile = directoryPath + "/" + filenames[fileindex];
		Fs.stat (curfile, statComplete);
	}

	function statComplete (err, stats) {
		if (err != null) {
			callback (err, null);
			return;
		}

		if (stats.isDirectory ()) {
			exports.findFiles (curfile, findFilesCallback);
			return;
		}

		if (stats.isFile ()) {
			callback (null, curfile);
		}
		++fileindex;
		checkNextFile ();
	}

	function findFilesCallback (err, filename) {
		if (err != null) {
			callback (err, null);
			return;
		}

		if (typeof filename == "string") {
			callback (null, filename);
		}

		if (filename === null) {
			++fileindex;
			checkNextFile ();
		}
	}
}
exports.findFiles = findFiles;

// findFileList - Scan the specified directory path and recurse into all subdirectories to find available filenames. Invokes the provided callback when complete, with "err" (non-null if an error occurred) and "fileList" parameters (an array of filenames, or null if an error occurred)
function findFileList (directoryPath, callback) {
	var filelist;

	filelist = [ ];
	findFiles (directoryPath, findFilesCallback);
	function findFilesCallback (err, filename) {
		if (err != null) {
			callback (err, null);
			return;
		}

		if (filename == null) {
			callback (null, filelist);
			return;
		}

		filelist.push (filename);
	}
}
exports.findFileList = findFileList;

// fileExists - Check if the named file exists and invoke the provided callback when complete, with "err" and "exists" parameters
function fileExists (path, callback) {
	Fs.stat (path, statComplete);
	function statComplete (err, stats) {
		var errstr;

		if (err != null) {
			errstr = "" + err;
			if (errstr.indexOf ("ENOENT") >= 0) {
				callback (null, false);
				return;
			}

			callback (err, null);
			return;
		}

		callback (null, true);
	}
}
exports.fileExists = fileExists;

// fileExistsPromise - Return a promise that resolves if the named path exists as a regular file, or rejects if it doesn't
function fileExistsPromise (path) {
	return (new Promise ((resolve, reject) => {
		Fs.stat (path, statComplete);
		function statComplete (err, stats) {
			if (err != null) {
				reject (err);
				return;
			}
			if (! stats.isFile ()) {
				reject (Error ("Not a regular file"));
				return;
			}
			resolve ();
		}
	}));
}
exports.fileExistsPromise = fileExistsPromise;

// fileExistsSync - Check if the named file exists and return a boolean value indicating if the file was found
function fileExistsSync (path) {
	var stat;

	try {
		stat = Fs.statSync (path);
	}
	catch (e) {
		stat = null;
	}

	return ((stat != null) && stat.isFile ());
}
exports.fileExistsSync = fileExistsSync;

// readConfigListFile - Synchronously read the contents of the specified list configuration file and return an array containing the resulting values. Lines containing only whitespace or beginning with a # character are ignored. Returns null if the file could not be read.
function readConfigListFile (filename) {
	var hostname, prefix, suffix, pos, configdata, parts, i, line, pos, config;

	pos = filename.lastIndexOf (".");
	if (pos >= 0) {
		hostname = Os.hostname ();
		prefix = filename.substring (0, pos);
		suffix = filename.substring (pos);

		// Check for variations on the "filename-hostname.conf" scheme
		line = prefix + "-" + hostname + suffix;
		if (fileExistsSync (line)) {
			Log.write (Log.NOTICE, "Using host-specific configuration overrides - basePath=" + filename + " overridePath=" + line);
			filename = line;
		}
		else {
			pos = hostname.indexOf (".");
			if (pos >= 0) {
				line = prefix + "-" + hostname.substring (0, pos) + suffix;
				if (fileExistsSync (line)) {
					Log.write (Log.NOTICE, "Using host-specific configuration overrides - basePath=" + filename + " overridePath=" + line);
					filename = line;
				}
			}
		}
	}

	try {
		configdata = Fs.readFileSync (filename, { "encoding" : "UTF8" });
	}
	catch (e) {
		Log.write (Log.ERR, "Failed to open \"" + filename + "\": " + e);
		return (null);
	}

	config = [ ];
	parts = configdata.split ("\n");
	for (i = 0; i < parts.length; ++i) {
		line = parts[i].trim ();
		if (line.match (/^\s*#/) || line.match (/^\s*$/)) {
			continue;
		}

		config.push (line.trim ());
	}

	Log.write (Log.INFO, "Read configuration - path=" + filename);
	return (config);
}
exports.readConfigListFile = readConfigListFile;
