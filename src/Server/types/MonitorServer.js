/*
* Copyright 2018 Membrane Software <author@membranesoftware.com>
*                 https://membranesoftware.com
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are met:
*
* 1. Redistributions of source code must retain the above copyright notice,
* this list of conditions and the following disclaimer.
*
* 2. Redistributions in binary form must reproduce the above copyright notice,
* this list of conditions and the following disclaimer in the documentation
* and/or other materials provided with the distribution.
*
* 3. Neither the name of the copyright holder nor the names of its contributors
* may be used to endorse or promote products derived from this software without
* specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
* AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
* IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
* LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
* SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
* INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
* CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
* POSSIBILITY OF SUCH DAMAGE.
*/
"use strict";

var App = global.App || { };
var EventEmitter = require ("events").EventEmitter;
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");
var ExecProcess = require (App.SOURCE_DIRECTORY + "/ExecProcess");
var RepeatTask = require (App.SOURCE_DIRECTORY + "/RepeatTask");
var Intent = require (App.SOURCE_DIRECTORY + "/Intent/Intent");
var ServerBase = require (App.SOURCE_DIRECTORY + "/Server/ServerBase");

const XSET_OFF_PROCESS_NAME = "xset-off.sh";
const XSET_ACTIVATE_PROCESS_NAME = "xset-activate.sh";
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
		];

		this.playProcess = null;
		this.playMediaName = "";
		this.isBrowserRunning = false;
		this.findBrowserProcessTimeout = null;
		this.isFindingBrowserProcess = false;
		this.browserUrl = "";

		this.emitter = new EventEmitter ();
		this.emitter.setMaxListeners (0);
		this.isClearing = false;
	}

	// Start the server's operation and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred)
	doStart (startCallback) {
		let deactivateDesktopBlankComplete;

		App.systemAgent.addInvokeRequestHandler ("/", SystemInterface.Constant.Monitor, (cmdInv) => {
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
				case SystemInterface.CommandId.CreateWebDisplayIntent: {
					return (this.createWebDisplayIntent (cmdInv));
				}
				case SystemInterface.CommandId.CreateMediaDisplayIntent: {
					return (this.createMediaDisplayIntent (cmdInv));
				}
			}
			return (null);
		});

		setTimeout (() => {
			this.deactivateDesktopBlank (deactivateDesktopBlankComplete);
		}, 0);
		deactivateDesktopBlankComplete = () => {
			startCallback ();
		};
	}

	// Execute subclass-specific stop operations and invoke the provided callback when complete
	doStop (stopCallback) {
		this.clear (stopCallback);
	}

	// Return a command invocation containing the server's status
	doGetStatus (cmdInv) {
		let params, intents;

		params = {
			isPlaying: (this.playProcess != null),
			mediaName: (this.playProcess != null) ? this.playMediaName : "",
			isShowingUrl: this.isBrowserRunning,
			showUrl: this.browserUrl
		};

		intents = App.systemAgent.findIntents (this.name, true);
		if (intents.length > 0) {
			params.intentName = intents[0].displayName;
		}

		return (this.createCommand ("MonitorServerStatus", SystemInterface.Constant.Monitor, params));
	}

	// Execute a ClearDisplay command and return a result command
	clearDisplay (cmdInv) {
		App.systemAgent.removeIntentGroup (this.name);
		this.clear (function () { });
		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Execute a PlayMedia command and return a result command
	playMedia (cmdInv) {
		let proc, clearComplete, activateDesktopBlankComplete, playProcessEnded;
		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}
		setTimeout (() => {
			this.clear (clearComplete);
		}, 0);
		clearComplete = () => {
			this.activateDesktopBlank (activateDesktopBlankComplete);
		};
		activateDesktopBlankComplete = () => {
			proc = new ExecProcess (OMXPLAYER_PLAY_PROCESS_NAME, [ ], {
				WORKING_DIR: App.DATA_DIRECTORY,
				TARGET_MEDIA: cmdInv.params.streamUrl
			}, "", null, playProcessEnded);
			this.playProcess = proc;
			this.playMediaName = cmdInv.params.mediaName;
		};

		playProcessEnded = () => {
			if (proc != this.playProcess) {
				return;
			}
			this.playProcess = null;
		};

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
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

		proc = new ExecProcess (OMXPLAYER_STOP_PROCESS_NAME, [ ], {
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

		proc = new ExecProcess (CHROMIUM_STOP_PROCESS_NAME, [ ], { }, "", null, callback);
	}

	// Execute a ShowWebUrl command and return a result command
	showWebUrl (cmdInv) {
		let clearComplete, deactivateDesktopBlankComplete;
		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}

		setTimeout (() => {
			this.clear (clearComplete);
		}, 0);
		clearComplete = () => {
			this.deactivateDesktopBlank (deactivateDesktopBlankComplete);
		};
		deactivateDesktopBlankComplete = () => {
			let proc;

			proc = new ExecProcess (CHROMIUM_START_PROCESS_NAME, [ ], {
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
		};

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
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
		found = false;

		procDataCallback = (lines, parseCallback) => {
			// The chromium-find-process.sh script prints "true" if the process was found
			for (let i = 0; i < lines.length; i++) {
				if (lines[i] == "true") {
					found = true;
				}
			}

			process.nextTick (parseCallback);
		};

		procEndCallback = () => {
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

		proc = new ExecProcess (CHROMIUM_FIND_PROCESS_NAME, [ ], { }, "", procDataCallback, procEndCallback);
	}

	// Deactivate and disable desktop screen blank functionality and invoke the provided callback when complete
	deactivateDesktopBlank (endCallback) {
		let proc;

		proc = new ExecProcess (XSET_OFF_PROCESS_NAME, [ ], { }, "", null, endCallback);
	}

	// Activate the desktop screen blank and invoke the provided callback when complete
	activateDesktopBlank (endCallback) {
		let proc;

		proc = new ExecProcess (XSET_ACTIVATE_PROCESS_NAME, [ ], { }, "", null, endCallback);
	}

	// Start an intent to show web content on display agents and return a CommandResult command
	createWebDisplayIntent (cmdInv) {
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
			App.systemAgent.removeIntentGroup (this.name);
			App.systemAgent.runIntent (intent, this.name);
			params.success = true;
		}

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, params));
	}

	// Start an intent to show media content on display agents and return a CommandResult command
	createMediaDisplayIntent (cmdInv) {
		let intent, params;

		params = {
			success: false,
			error: ""
		};
		intent = Intent.createIntent ("MediaDisplayIntent", cmdInv.params);
		if (intent == null) {
			params.error = "Internal server error";
		}
		else {
			App.systemAgent.removeIntentGroup (this.name);
			App.systemAgent.runIntent (intent, this.name);
			params.success = true;
		}

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, params));
	}
}
module.exports = MonitorServer;
