/*
* Copyright 2018-2021 Membrane Software <author@membranesoftware.com> https://membranesoftware.com
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

const App = global.App || { };
const Path = require ("path");
const Log = require (Path.join (App.SOURCE_DIRECTORY, "Log"));
const SystemInterface = require (Path.join (App.SOURCE_DIRECTORY, "SystemInterface"));
const IntentBase = require (Path.join (App.SOURCE_DIRECTORY, "Intent", "IntentBase"));

const MinRestingPeriod = 15000; // milliseconds
const CountdownTime = 20000; // milliseconds

// Stage names
const Initializing = "initializing";
const ShowingUrl = "showingUrl";
const Resting = "resting";

class WebDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.displayName = App.uiText.getText ("WebDisplayIntentName");
		this.stateType = "WebDisplayIntentState";
		this.isDisplayIntent = true;
		this.lastCommandTime = 0;
		this.nextCommandTime = 0;
		this.isCountdownShown = false;
		this.monitorStatus = { };
	}

	// Configure the intent's state using values in the provided params object
	doConfigure (configParams) {
		if (this.isStringArray (configParams.urls)) {
			this.state.urls = configParams.urls;
		}
		if (typeof configParams.isShuffle == "boolean") {
			this.state.isShuffle = configParams.isShuffle;
		}
		if (typeof configParams.minItemDisplayDuration == "number") {
			if (configParams.minItemDisplayDuration > 0) {
				this.state.minItemDisplayDuration = configParams.minItemDisplayDuration;
			}
		}
		if (typeof configParams.maxItemDisplayDuration == "number") {
			if (configParams.maxItemDisplayDuration > 0) {
				this.state.maxItemDisplayDuration = configParams.maxItemDisplayDuration;
			}
		}
	}

	// Execute actions appropriate when the intent becomes active
	doStart () {
		if (! Array.isArray (this.state.urls)) {
			this.state.urls = [ ];
		}
		if (! Array.isArray (this.state.urlChoices)) {
			this.state.urlChoices = [ ];
		}
		if (typeof this.state.isShuffle != "boolean") {
			this.state.isShuffle = false;
		}
		if (typeof this.state.minItemDisplayDuration != "number") {
			this.state.minItemDisplayDuration = 300;
		}
		else {
			if (this.state.minItemDisplayDuration < 1) {
				this.state.minItemDisplayDuration = 1;
			}
		}
		if (typeof this.state.maxItemDisplayDuration != "number") {
			this.state.maxItemDisplayDuration = 900;
		}
		else {
			if (this.state.maxItemDisplayDuration < 1) {
				this.state.maxItemDisplayDuration = 1;
			}
		}

		this.lastCommandTime = 0;
		this.nextCommandTime = 0;
		this.isCountdownShown = false;
		this.monitorStatus = { };
	}

	// Execute actions appropriate for the current state of the application
	doUpdate () {
		if (this.state.urls.length <= 0) {
			this.clearStage ();
			return;
		}
		if (! this.isDisplayConditionActive) {
			this.clearStage ();
			return;
		}
		const monitorstatus = App.systemAgent.agentControl.getLocalAgent ().lastStatus.monitorServerStatus;
		if ((typeof monitorstatus != "object") || (monitorstatus == null)) {
			this.clearStage ();
			return;
		}
		this.monitorStatus = monitorstatus;
		if (this.stage == "") {
			this.setStage (Initializing);
		}
	}

	// Stage methods
	initializing () {
		if (this.monitorStatus.isShowUrlAvailable !== true) {
			return;
		}
		this.setStage (ShowingUrl);
	}

	showingUrl () {
		const url = this.state.isShuffle ?
			this.getRandomChoice (this.state.urls, this.state.urlChoices) :
			this.getSequentialChoice (this.state.urls, this.state.urlChoices);
		if (typeof url != "string") {
			return;
		}
		App.systemAgent.agentControl.invokeCommand (App.systemAgent.agentId, SystemInterface.Constant.DefaultInvokePath, App.systemAgent.createCommand ("ShowWebUrl", { url: url }), SystemInterface.CommandId.CommandResult).catch ((err) => {
			Log.debug (`${this.toString ()} failed to invoke ShowWebUrl; err=${err}`);
		});

		this.lastCommandTime = this.updateTime;
		this.nextCommandTime = this.updateTime + App.systemAgent.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
		this.isCountdownShown = false;
		this.setStage (Resting);
	}

	resting () {
		if (! this.hasTimeElapsed (this.lastCommandTime, MinRestingPeriod)) {
			return;
		}
		if (this.monitorStatus.displayState !== SystemInterface.Constant.ShowUrlDisplayState) {
			this.setStage (ShowingUrl);
			return;
		}
		if (this.updateTime >= this.nextCommandTime) {
			this.setStage (ShowingUrl);
			return;
		}
		if (! this.isCountdownShown) {
			if (this.updateTime >= (this.nextCommandTime - CountdownTime)) {
				this.isCountdownShown = true;
				const t = this.nextCommandTime - Date.now ();
				App.systemAgent.agentControl.invokeCommand (App.systemAgent.agentId, SystemInterface.Constant.DefaultInvokePath, App.systemAgent.createCommand ("ShowDesktopCountdown", {
					countdownTime: (t > 0) ? t : CountdownTime
				}), SystemInterface.CommandId.CommandResult).catch ((err) => {
					Log.debug (`${this.toString ()} failed to invoke ShowDesktopCountdown; err=${err}`);
				});
			}
		}
	}
}
module.exports = WebDisplayIntent;
