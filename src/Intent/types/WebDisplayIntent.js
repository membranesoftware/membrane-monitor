/*
* Copyright 2018-2020 Membrane Software <author@membranesoftware.com> https://membranesoftware.com
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
const Result = require (Path.join (App.SOURCE_DIRECTORY, "Result"));
const Log = require (Path.join (App.SOURCE_DIRECTORY, "Log"));
const SystemInterface = require (Path.join (App.SOURCE_DIRECTORY, "SystemInterface"));
const IntentBase = require (Path.join (App.SOURCE_DIRECTORY, "Intent", "IntentBase"));

const AgentCommandWaitPeriod = 7000; // milliseconds

class WebDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.name = "WebDisplayIntent";
		this.displayName = "Track websites";
		this.stateType = "WebDisplayIntentState";
		this.isDisplayIntent = true;
	}

	// Configure the intent's state using values in the provided params object and return a Result value
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

		return (Result.Success);
	}

	// Perform actions appropriate when the intent becomes active
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
		if (typeof this.state.maxItemDisplayDuration != "number") {
			this.state.maxItemDisplayDuration = 900;
		}

		this.lastCommandTime = 0;
		this.nextCommandTime = 0;
	}

	// Perform actions appropriate for the current state of the application
	doUpdate () {
		let show, url;

		if (this.state.urls.length <= 0) {
			return;
		}
		if (! this.isDisplayConditionActive) {
			return;
		}
		if (! this.hasTimeElapsed (this.lastCommandTime, AgentCommandWaitPeriod)) {
			return;
		}

		const agent = App.systemAgent.agentControl.getLocalAgent ();
		const monitorstatus = agent.lastStatus.monitorServerStatus;
		if ((typeof monitorstatus != "object") || (monitorstatus == null)) {
			return;
		}
		if (! monitorstatus.isShowUrlAvailable) {
			return;
		}

		show = false;
		if (monitorstatus.displayState !== SystemInterface.Constant.ShowUrlDisplayState) {
			show = true;
		}
		if (! show) {
			if ((this.state.minItemDisplayDuration > 0) && (this.state.maxItemDisplayDuration > 0)) {
				if (this.updateTime >= this.nextCommandTime) {
					show = true;
				}
			}
		}
		if (! show) {
			return;
		}

		if (this.state.isShuffle) {
			url = this.getRandomChoice (this.state.urls, this.state.urlChoices);
		}
		else {
			url = this.getSequentialChoice (this.state.urls, this.state.urlChoices);
		}
		if (typeof url != "string") {
			return;
		}

		const cmd = App.systemAgent.createCommand ("ShowWebUrl", SystemInterface.Constant.Monitor, { url: url });
		if (cmd == null) {
			return;
		}
		App.systemAgent.agentControl.invokeCommand (App.systemAgent.agentId, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult).catch ((err) => {
			Log.debug (`${this.toString ()} failed to invoke ShowWebUrl; err=${err}`);
		});

		this.lastCommandTime = this.updateTime;
		if ((this.state.minItemDisplayDuration > 0) && (this.state.maxItemDisplayDuration > 0)) {
			this.nextCommandTime = this.updateTime + this.prng.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
		}
	}
}
module.exports = WebDisplayIntent;
