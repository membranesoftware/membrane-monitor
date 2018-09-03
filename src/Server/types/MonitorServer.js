"use strict";

var App = global.App || { };
var EventEmitter = require ("events").EventEmitter;
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");
var AgentProcess = require (App.SOURCE_DIRECTORY + "/AgentProcess");
var AgentControl = require (App.SOURCE_DIRECTORY + "/AgentControl");
var RepeatTask = require (App.SOURCE_DIRECTORY + "/RepeatTask");
var Intent = require (App.SOURCE_DIRECTORY + "/Intent/Intent");
var ServerBase = require (App.SOURCE_DIRECTORY + "/Server/ServerBase");

const XSET_PROCESS_NAME = "xset.sh";
const OMXPLAYER_PLAY_PROCESS_NAME = "omxplayer-play.sh";
const OMXPLAYER_STOP_PROCESS_NAME = "omxplayer-stop.sh";
const CHROMIUM_START_PROCESS_NAME = "chromium-start.sh";
const CHROMIUM_STOP_PROCESS_NAME = "chromium-stop.sh";
const CHROMIUM_FIND_PROCESS_NAME = "chromium-find-process.sh";
const FIND_BROWSER_PROCESS_PERIOD = 15000; // milliseconds
const CLEAR_COMPLETE_EVENT = "clearComplete";

class MonitorServer extends ServerBase {
	constructor () {
		super ();
		this.name = "MonitorServer";
		this.description = "Accept and execute commands to control content shown by a display";

		this.configureParams = [
			{
				name: "writeIntentsInterval",
				type: "number",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.GreaterThanZero,
				description: "The interval to use for periodically storing intent state, in seconds",
				defaultValue: 900
			}
		];

		this.playProcess = null;
		this.playMediaName = "";
		this.isBrowserRunning = false;
		this.findBrowserProcessTimeout = null;
		this.isFindingBrowserProcess = false;
		this.browserUrl = "";

		this.agentControl = new AgentControl ();

		this.updateIntentsTask = new RepeatTask ();
		this.writeIntentsTask = new RepeatTask ();
		this.webDisplayIntent = null;
		this.emitter = new EventEmitter ();
		this.emitter.setMaxListeners (0);
		this.isClearing = false;
	}

	// Start the server's operation and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred)
	doStart (startCallback) {
		let record, intent, proc;

		record = App.systemAgent.runState.monitorServerIntent;
		if ((typeof record == "object") && (record != null)) {
			intent = Intent.createIntent (record.name);
			if (intent == null) {
				Log.write (Log.NOTICE, `${this.toString ()} failed to read intent state; name=${record.name}`);
			}
			else {
				intent.agentControl = this.agentControl;
				intent.readIntentState (record);
				this.webDisplayIntent = intent;
			}
		}

		App.systemAgent.addInvokeRequestHandler ("/", SystemInterface.Constant.Display, (cmdInv) => {
			switch (cmdInv.command) {
				case SystemInterface.CommandId.GetStatus: {
					return (this.getStatus ());
				}
				case SystemInterface.CommandId.ClearDisplay: {
					return (this.clearDisplay (cmdInv));
				}
				case SystemInterface.CommandId.PlayMedia: {
					return (this.playMedia (cmdInv));
				}
				case SystemInterface.CommandId.ShowWebUrl: {
					return (this.showWebUrl (cmdInv));
				}
				case SystemInterface.CommandId.CreateMonitorIntent: {
					return (this.createMonitorIntent (cmdInv));
				}
			}
			return (null);
		});

		proc = new AgentProcess (XSET_PROCESS_NAME, [ ], { }, "", null, null);

		this.updateIntentsTask.setRepeating ((callback) => {
			this.updateIntents ();
			process.nextTick (callback);
		}, App.HEARTBEAT_PERIOD, Math.floor (App.HEARTBEAT_PERIOD * 1.1));

		this.writeIntentsTask.setRepeating ((callback) => {
			this.writeIntents ();
			process.nextTick (callback);
		}, Math.floor (this.configureMap.writeIntentsInterval * 1000 * 0.95), (this.configureMap.writeIntentsInterval * 1000));

		this.isRunning = true;
		process.nextTick (startCallback);
	}

	// Stop the server's operation and set isRunning to false, and invoke the provided callback when complete
	stop (stopCallback) {
		this.isRunning = false;
		this.updateIntentsTask.stopRepeat ();
		this.writeIntentsTask.stopRepeat ();
		process.nextTick (stopCallback);
	}

	// Return a command invocation containing the server's status
	doGetStatus (cmdInv) {
		let params;

		params = {
			isPlaying: (this.playProcess != null),
			mediaName: (this.playProcess != null) ? this.playMediaName : "",
			isShowingUrl: this.isBrowserRunning,
			showUrl: this.browserUrl
		};
		if ((this.webDisplayIntent != null) && this.webDisplayIntent.isActive) {
			params.intentName = this.webDisplayIntent.displayName;
		}
		return (this.createCommand ("MonitorServerStatus", SystemInterface.Constant.Display, params));
	}

	// Execute a ClearDisplay command and return a result command
	clearDisplay (cmdInv) {
		if (this.webDisplayIntent != null) {
			this.webDisplayIntent.setActive (false);
		}
		this.clear (function () { });
		return (this.createCommand ("CommandResult", SystemInterface.Constant.Display, {
			success: true
		}));
	}

	// Execute a PlayMedia command and return a result command
	playMedia (cmdInv) {
		let proc, clearComplete, playProcessEnded;

		Log.write (Log.DEBUG, this.toString () + " play media; cmd=" + JSON.stringify (cmdInv));

		if (this.webDisplayIntent != null) {
			this.webDisplayIntent.setActive (false);
		}
		this.clear (() => {
			clearComplete ();
		});
		clearComplete = () => {
			proc = new AgentProcess (OMXPLAYER_PLAY_PROCESS_NAME, [ ], {
				WORKING_DIR: App.DATA_DIRECTORY,
				TARGET_MEDIA: cmdInv.params.streamUrl
			}, "", null, playProcessEnded);
			this.playProcess = proc;
			this.playMediaName = cmdInv.params.mediaName;
		};

		playProcessEnded = () => {
			Log.write (Log.DEBUG, this.toString () + " play process ended; cmd=" + JSON.stringify (cmdInv));

			if (proc != this.playProcess) {
				return;
			}
			this.playProcess = null;
		};

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Display, {
			success: true
		}));
	}

	// Stop all running display processes
	clear (clearCallback) {
		let stopOmxplayerComplete, stopChromiumComplete, endClear;

		this.emitter.once (CLEAR_COMPLETE_EVENT, clearCallback);
		if (this.isClearing) {
			return;
		}

		Log.write (Log.DEBUG3, this.toString () + " begin clear");
		this.isClearing = true;
		this.stopOmxplayer (() => {
			stopOmxplayerComplete ();
		});
		stopOmxplayerComplete = () => {
			this.stopChromium (stopChromiumComplete);
		};
		stopChromiumComplete = () => {
			endClear ();
		};

		endClear = () => {
			Log.write (Log.DEBUG3, this.toString () + " end clear");
			this.isClearing = false;
			this.emitter.emit (CLEAR_COMPLETE_EVENT);
		};
	}

	// Stop any active omxplayer process and invoke the provided callback when complete
	stopOmxplayer (callback) {
		let proc, playproc;

		playproc = this.playProcess;
		if (playproc == null) {
			if (callback != null) {
				process.nextTick (callback);
			}
			return;
		}
		this.playProcess = null;

		proc = new AgentProcess (OMXPLAYER_STOP_PROCESS_NAME, [ ], {
			SIGNAL_TYPE: "TERM"
		}, "", null, callback);

		// TODO: Possibly repeat the operation with a KILL signal
	}

	// Stop any active chromium process and invoke the provided callback when complete
	stopChromium (callback) {
		let proc;

		if (! this.isBrowserRunning) {
			if (callback != null) {
				process.nextTick (callback);
			}
			return;
		}

		proc = new AgentProcess (CHROMIUM_STOP_PROCESS_NAME, [ ], { }, "", null, callback);
	}

	// Execute a ShowWebUrl command and return a result command
	showWebUrl (cmdInv) {
		Log.write (Log.DEBUG, this.toString () + " show web URL; cmd=" + JSON.stringify (cmdInv));

		this.clear (() => {
			let proc;

			proc = new AgentProcess (CHROMIUM_START_PROCESS_NAME, [ ], {
				TARGET_URL: cmdInv.params.url
			}, "", null, null);

			this.isBrowserRunning = true;
			this.browserUrl = cmdInv.params.url;
			if (this.findBrowserProcessTimeout != null) {
				clearTimeout (this.findBrowserProcessTimeout);
			}
			this.findBrowserProcessTimeout = setTimeout (() => {
				this.findBrowserProcess ();
			}, FIND_BROWSER_PROCESS_PERIOD);
		});

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Display, {
			success: true
		}));
	}

	// Execute operations to check if a browser process is running and update the isBrowserRunning data member
	findBrowserProcess () {
		let proc, found, procDataCallback, procEndCallback;

		if (this.isFindingBrowserProcess) {
			return;
		}

		this.isFindingBrowserProcess = true;
		Log.write (Log.DEBUG2, this.toString () + " findBrowserProcess");
		found = false;

		procDataCallback = (lines, parseCallback) => {
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG2, this.toString () + " findBrowserProcess data: " + JSON.stringify (lines));
			}
			// The chromium-find-process.sh script prints "true" if the process was found
			for (let i = 0; i < lines.length; i++) {
				if (lines[i] == "true") {
					found = true;
				}
			}

			process.nextTick (parseCallback);
		};

		procEndCallback = () => {
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG2, this.toString () + " findBrowserProcess end found=" + found);
			}
			this.isFindingBrowserProcess = false;
			this.isBrowserRunning = found;

			if (! found) {
				this.browserUrl = "";
			}
			else {
				this.findBrowserProcessTimeout = setTimeout (() => {
					this.findBrowserProcess ();
				}, FIND_BROWSER_PROCESS_PERIOD);
			}
		};

		proc = new AgentProcess (CHROMIUM_FIND_PROCESS_NAME, [ ], { }, "", procDataCallback, procEndCallback);
	}

	// Perform actions to update active intents as appropriate for the current state of the application
	updateIntents () {
		let cmd;

		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, `${this.toString ()} updateIntents begin`);
		}

		if ((this.webDisplayIntent == null) || (! this.webDisplayIntent.isActive)) {
			this.updateIntentsTask.suspendRepeat ();
			return;
		}

		cmd = App.systemAgent.getStatus ();
		if (cmd != null) {
			this.agentControl.updateAgentStatus (cmd);
		}

		this.webDisplayIntent.update ();
		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, `${this.toString ()} updateIntents ended`);
		}
	}

	// Store state for all intents
	writeIntents () {
		let cmd, result;

		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, `${this.toString ()} writeIntents begin`);
		}

		if ((this.webDisplayIntent == null) || (! this.webDisplayIntent.isActive)) {
			this.writeIntentsTask.suspendRepeat ();
			return;
		}

		cmd = this.createCommand ("IntentState", SystemInterface.Constant.Display, this.webDisplayIntent.getIntentState ());
		if (cmd != null) {
			App.systemAgent.updateRunState ({
				monitorServerIntent: cmd.params
			});
		}
	}

	// Start an intent to show web content on display agents and return a CommandResult command
	createMonitorIntent (cmdInv) {
		let intent, params;

		params = {
			success: false,
			error: ""
		};
		intent = Intent.createIntent ("WebDisplayIntent", cmdInv.params);
		if (intent == null) {
			params.error = "Internal server error";
		}
		else {
			intent.agentControl = this.agentControl;
			if (this.webDisplayIntent != null) {
				this.webDisplayIntent.setActive (false);
			}
			this.webDisplayIntent = intent;
			this.updateIntentsTask.setNextRepeat (0);
			this.writeIntentsTask.setNextRepeat (4800);
			params.success = true;
		}

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Display, params));
	}
}
module.exports = MonitorServer;
