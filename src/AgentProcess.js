// Class that runs a child process and generates events as lines of data are generated

var App = global.App || { };
var Util = require ("util");
var Fs = require ("fs");
var ChildProcess = require ("child_process");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var FsUtil = require (App.SOURCE_DIRECTORY + "/FsUtil");

// Constructor - execPath is the path to the binary to run, execArgs is an array containing command line arguments for the child process, envParams is an object containing environment variables for the child process, workingPath is the path to the working directory for process execution (defaults to the application data directory if empty), dataCallback is a function that should be called each time a set of lines is parsed (invoked with an array of strings and a callback), and endCallback is a function that should be called when the process ends.
function AgentProcess (execPath, execArgs, envParams, workingPath, dataCallback, endCallback) {
	this.execPath = execPath;
	if (this.execPath.indexOf ("/") !== 0) {
		this.execPath = App.BIN_DIRECTORY + "/" + this.execPath;
	}

	this.workingPath = workingPath;
	if ((typeof this.workingPath != "string") || (this.workingPath == "")) {
		this.workingPath = App.DATA_DIRECTORY;
	}

	if ((typeof envParams != "object") || (envParams == null)) {
		envParams = { };
	}
	this.envParams = envParams;

	if (! Array.isArray (execArgs)) {
		execArgs = [ ];
	}
	this.execArgs = execArgs;

	this.dataCallback = dataCallback;
	this.endCallback = endCallback;
	this.hasError = false;
	this.isPaused = false;
	this.isEnded = false;
	this.process = null;
	this.runProcess ();
}

module.exports = AgentProcess;

AgentProcess.STOP_SIGNAL_REPEAT_DELAY = 4800; // milliseconds

AgentProcess.prototype.runProcess = function () {
	var s, proc, endcount, ended;
	
	s = this;
	Log.write (Log.DEBUG2, `AgentProcess launch; execPath="${this.execPath}" execArgs=${JSON.stringify (this.execArgs)} workingPath="${this.workingPath}" env=${JSON.stringify (this.envParams)}`);
	try {
		proc = ChildProcess.spawn (this.execPath, this.execArgs, { "cwd" : this.workingPath, "env" : this.envParams });
	}
	catch (err) {
		Log.write (Log.ERR, `Failed to launch process; execPath="${this.execPath}" execArgs=${JSON.stringify (this.execArgs)} workingPath="${this.workingPath}" env=${JSON.stringify (this.envParams)} err=${err}\n${err.stack}`);

		s.hasError = true;
		if (s.endCallback != null) {
			setTimeout (() => {
				s.endCallback ();
			}, 0);
		}
		return;
	}
	Log.write (Log.DEBUG2, `AgentProcess launch success; pid=${proc.pid} execPath="${this.execPath}" execArgs=${JSON.stringify (this.execArgs)} workingPath="${this.workingPath}" env=${JSON.stringify (this.envParams)}`);
	this.process = proc;
	endcount = 0;
	this.isEnded = false;
	this.readLineCount = 0;
	this.readByteCount = 0;
	this.stdoutBuffer = "";
	this.stderrBuffer = "";

	proc.stdout.on ("data", function (data) {
		s.stdoutBuffer += data.toString ();
		s.readByteCount += data.length;
		s.parseBuffer ();
	});

	proc.stdout.on ("end", function () {
		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, "[AgentProcess " + proc.pid + "] stdout ended, pid " + proc.pid);
		}
		
		++endcount;
		if (endcount >= 3) {
			endRun ();
		}
	});

	proc.stderr.on ("data", function (data) {
		s.stderrBuffer += data.toString ();
		s.readByteCount += data.length;
		s.parseBuffer ();
	});

	proc.stderr.on ("end", function () {
		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, "[AgentProcess " + proc.pid + "] stderr ended, pid " + proc.pid);
		}

		++endcount;
		if (endcount >= 3) {
			endRun ();
		}
	});

	proc.on ("error", function (err){
		Log.write (Log.ERR, "[AgentProcess " + proc.pid + "] process error, " + err.toString ());
		s.hasError = true;
		endRun ();
	});

	proc.on ("close", function (code, signal) {
		Log.write (Log.DEBUG2, "AgentProcess ended; pid=" + proc.pid + " execPath=\"" + s.execPath + "\" code=" + code + " signal=" + signal);

		if (code != 0) {
			Log.write (Log.DEBUG3, "AgentProcess ended with non-success code; pid=" + proc.pid + " execPath=\"" + s.execPath + "\" code=" + code + " signal=" + signal);
		}

		++endcount;
		if (endcount >= 3) {
			endRun ();
		}
	});

	function endRun () {
		if (s.isEnded) {
			return;
		}

		Log.write (Log.DEBUG3, "[AgentProcess " + proc.pid + "] run complete readLineCount=" + s.readLineCount + " readByteCount=" + s.readByteCount + " stdoutBufferLength=" + s.stdoutBuffer.length + " stderrBufferLength=" + s.stderrBuffer.length + " isPaused=" + s.isPaused);
		s.isEnded = true;
		if (s.hasError) {
			if (s.endCallback != null) {
				s.endCallback ();
				s.endCallback = null;
			}
			return;
		}

		if (! s.isPaused) {
			s.parseBuffer ();
		}
	}
};

// pauseEvents - Pause the process's input events
AgentProcess.prototype.pauseEvents = function () {
	if (this.process == null) {
		return;
	}

	this.isPaused = true;
	this.process.stdout.pause ();
	this.process.stderr.pause ();
};

// resumeEvents - Resume the process's input events
AgentProcess.prototype.resumeEvents = function () {
	if (this.process == null) {
		return;
	}

	this.process.stdout.resume ();
	this.process.stderr.resume ();
	this.isPaused = false;
};

// parseBuffer - Parse any data contained in process buffers
AgentProcess.prototype.parseBuffer = function () {
	var proc, pos, line, lines;

	if (this.hasError) {
		endParse ();
		return;
	}

	proc = this;
	lines = [ ];
	while (true) {
		pos = this.stdoutBuffer.indexOf ("\n");
		if (pos < 0) {
			break;
		}
		
		line = this.stdoutBuffer.substring (0, pos);
		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, "[AgentProcess " + this.process.pid + "] - parse stdout line: " + line);
		}
		this.stdoutBuffer = this.stdoutBuffer.substring (pos + 1);

		lines.push (line);
		++(this.readLineCount);
	}
	
	while (true) {
		pos = this.stderrBuffer.indexOf ("\n");
		if (pos < 0) {
			break;
		}
		
		line = this.stderrBuffer.substring (0, pos);
		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, "[AgentProcess " + this.process.pid + "] - parse stderr line: " + line);
		}
		this.stderrBuffer = this.stderrBuffer.substring (pos + 1);

		lines.push (line);
		++(this.readLineCount);
	}

	if (lines.length <= 0) {
		endParse ();
		return;
	}

	this.pauseEvents ();
	if (this.dataCallback != null) {
		this.dataCallback (lines, function () {
			endParse ();
		});
	}
	else {
		process.nextTick (endParse);
	}

	function endParse () {
		if (proc.isPaused) {
			proc.resumeEvents ();
		}

		if (proc.isEnded) {
			if (proc.endCallback != null) {
				proc.endCallback ();
				proc.endCallback = null;
			}
		}
	}
};

// stop - Stop the process
AgentProcess.prototype.stop = function () {
	var proc, pid;

	proc = this;
	if (proc.isEnded) {
		return;
	}

	pid = proc.process.pid;
	Log.write (Log.DEBUG2, "[AgentProcess " + pid + "] - stop with SIGTERM");
	proc.process.kill ("SIGTERM");
	setTimeout (repeatKill, AgentProcess.STOP_SIGNAL_REPEAT_DELAY);
	function repeatKill () {
		if (proc.isEnded) {
			Log.write (Log.DEBUG3, "[AgentProcess " + pid + "] - process verified as ended by SIGTERM");
			return;
		}

		Log.write (Log.DEBUG2, "[AgentProcess " + pid + "] - stop with SIGKILL");
		proc.process.kill ("SIGKILL");
	}
};
