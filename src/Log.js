// Log class

var App = global.App || { };

exports.ERR = 0;
exports.WARNING = 1;
exports.NOTICE = 2;
exports.INFO = 3;
exports.DEBUG = 4;
exports.DEBUG1 = 5;
exports.DEBUG2 = 6;
exports.DEBUG3 = 7;
exports.DEBUG4 = 8;
exports.NUM_LEVELS = 9;

var Fs = require ('fs');
var logLevel = exports.INFO;
var logLevelNames = [ 'ERR', 'WARNING', 'NOTICE', 'INFO', 'DEBUG', 'DEBUG1', 'DEBUG2', 'DEBUG3', 'DEBUG4', ];
var logConsoleOutput = false;
var logFilename = 'main.log';

// write - Write a message to the log
exports.write = function (level, message) {
	var now, output;

	if ((level < 0) || (level >= exports.NUM_LEVELS)) {
		return;
	}

	if (level > logLevel) {
		return;
	}

	now = new Date ();
	output = '[' + exports.getDateString (now) + ']' + '[' + logLevelNames[level] + '] ' + message;
	if (logConsoleOutput) {
		console.log (output);
	}
	Fs.appendFileSync (App.DATA_DIRECTORY + '/' + logFilename, output + "\n", { 'mode' : 0o644 });
};

// setConsoleOutput - Set the state of the log's console output option. If enabled, log messages are written to the console as well as the log file. 
exports.setConsoleOutput = function (enable) {
	logConsoleOutput = enable;
};

// getDateString - Return a formatted string generated from the provided Date object
exports.getDateString = function (d) {
	var year, month, day, hour, minute, second, ms;

	year = '' + d.getFullYear ();
	month = '' + (d.getMonth () + 1);
	if (month.length < 2) {
		month = '0' + month;
	}

	day = '' + d.getDate ();
	if (day.length < 2) {
		day = '0' + day;
	}

	hour = '' + d.getHours ();
	if (hour.length < 2) {
		hour = '0' + hour;
	}

	minute = '' + d.getMinutes ();
	if (minute.length < 2) {
		minute = '0' + minute;
	}

	second = '' + d.getSeconds ();
	if (second.length < 2) {
		second = '0' + second;
	}

	ms = '' + d.getMilliseconds ();
	while (ms.length < 3) {
		ms = '0' + ms;
	}

	return (year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second + '.' + ms);
};

// getDurationString - Return a formatted duration string generated from the provided number of milliseconds
exports.getDurationString = function (ms) {
	var duration, t, s;

	duration = '';
	t = ms;
	t /= 1000;
	if (t >= 86400) {
		duration += Math.floor (t / 86400) + 'd ';
		t %= 86400;
	}

	s = '' + Math.floor (t / 3600);
	if (s.length < 2) {
		s = '0' + s;
	}
	duration += s;
	t %= 3600;
	
	s = '' + Math.floor (t / 60);
	if (s.length < 2) {
		s = '0' + s;
	}
	duration += ':' + s;
	t %= 60;
	
	s = '' + Math.floor (t);
	if (s.length < 2) {
		s = '0' + s;
 	}
	duration += ':' + s;

	return (duration);
};

// setLevelByName - Set the log level using the provided name. Returns true if the name was recognized, or false if not.
exports.setLevelByName = function (levelName) {
	var i, rval;

	rval = false;
	for (i = 0; i < logLevelNames.length; ++i) {
		if (logLevelNames[i] == levelName) {
			logLevel = i;
			rval = true;
			break;
		}
	}

	return (rval);
};
