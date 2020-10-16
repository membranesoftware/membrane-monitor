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

const AgentCommandWaitPeriod = 5000; // milliseconds

class StreamCacheDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.name = "StreamCacheDisplayIntent";
		this.displayName = "Play cached streams";
		this.stateType = "StreamCacheDisplayIntentState";
		this.isDisplayIntent = true;

		// Read-only data members
		this.isPaused = false;

		this.items = [ ];
		this.itemChoices = [ ];
		this.itemRefreshCount = 0;
	}

	// Configure the intent's state using values in the provided params object and return a Result value
	doConfigure (configParams) {
		if (typeof configParams.isShuffle == "boolean") {
			this.state.isShuffle = configParams.isShuffle;
		}
		if (typeof configParams.minItemDisplayDuration == "number") {
			if (configParams.minItemDisplayDuration >= 0) {
				this.state.minItemDisplayDuration = configParams.minItemDisplayDuration;
			}
		}
		if (typeof configParams.maxItemDisplayDuration == "number") {
			if (configParams.maxItemDisplayDuration >= 0) {
				this.state.maxItemDisplayDuration = configParams.maxItemDisplayDuration;
			}
		}
		if (typeof configParams.minStartPositionDelta == "number") {
			this.state.minStartPositionDelta = configParams.minStartPositionDelta;
		}
		if (typeof configParams.maxStartPositionDelta == "number") {
			this.state.maxStartPositionDelta = configParams.maxStartPositionDelta;
		}

		return (Result.Success);
	}

	// Perform actions appropriate when the intent becomes active
	doStart () {
		if (typeof this.state.isShuffle != "boolean") {
			this.state.isShuffle = false;
		}
		if (typeof this.state.minItemDisplayDuration != "number") {
			this.state.minItemDisplayDuration = 300;
		}
		if (typeof this.state.maxItemDisplayDuration != "number") {
			this.state.maxItemDisplayDuration = 900;
		}
		if (typeof this.state.minStartPositionDelta != "number") {
			this.state.minStartPositionDelta = 0;
		}
		if (typeof this.state.maxStartPositionDelta != "number") {
			this.state.maxStartPositionDelta = 0;
		}

		this.isPaused = false;
		this.lastCommandTime = 0;
		this.nextCommandTime = 0;
		this.lastPauseTime = 0;
	}

	// Set the intent's paused state
	setPaused (paused) {
		if (this.isPaused == paused) {
			return;
		}
		this.isPaused = paused;
		const now = Date.now ();
		if (this.isPaused) {
			this.lastPauseTime = now;
		}
		else {
			this.nextCommandTime += (now - this.lastPauseTime);
		}
	}

	// Perform actions appropriate for the current state of the application
	doUpdate () {
		let refresh, play, item;

		const server = App.systemAgent.getServer ("MonitorServer");
		if ((this.items.length > 0) && (this.itemRefreshCount <= 0)) {
			refresh = false;
			if (server != null) {
				if (this.items.length != Object.keys (server.streamMap).length) {
					refresh = true;
				}
				else {
					for (const item of this.items) {
						if (server.streamMap[item] === undefined) {
							refresh = true;
							break;
						}
					}
				}
			}
			if (refresh) {
				this.items = [ ];
				this.itemChoices = [ ];
			}
			this.itemRefreshCount = this.items.length;
		}
		if (this.items.length <= 0) {
			if (server != null) {
				this.items = Object.keys (server.streamMap);
				this.itemChoices = [ ];
				this.itemRefreshCount = this.items.length;
			}
			if (this.items.length <= 0) {
				return;
			}
		}
		if (this.isPaused) {
			return;
		}
		if (! this.isDisplayConditionActive) {
			this.setPaused (false);
			this.nextCommandTime = 0;
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

		play = false;
		if (monitorstatus.displayState !== SystemInterface.Constant.PlayMediaDisplayState) {
			play = true;
		}
		if (! play) {
			if ((this.state.minItemDisplayDuration > 0) && (this.state.maxItemDisplayDuration > 0)) {
				if (this.updateTime >= this.nextCommandTime) {
					play = true;
				}
			}
		}
		if (! play) {
			return;
		}

		if (this.state.isShuffle) {
			item = this.getRandomChoice (this.items, this.itemChoices);
		}
		else {
			item = this.getSequentialChoice (this.items, this.itemChoices);
		}
		if (item == null) {
			return;
		}

		this.executePlayCacheStream (item);
		--(this.itemRefreshCount);

		this.lastCommandTime = this.updateTime;
		if ((this.state.minItemDisplayDuration > 0) && (this.state.maxItemDisplayDuration > 0)) {
			this.nextCommandTime = this.updateTime + this.prng.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
		}
	}

	// Execute a PlayCacheStream command for the provided target agent and stream item
	executePlayCacheStream (item) {
		const params = {
			streamId: item
		};
		if ((this.state.minStartPositionDelta > 0) || (this.state.maxStartPositionDelta > 0)) {
			params.minStartPositionDelta = this.state.minStartPositionDelta;
			params.maxStartPositionDelta = this.state.maxStartPositionDelta;
		}

		const cmd = App.systemAgent.createCommand ("PlayCacheStream", SystemInterface.Constant.Monitor, params);
		if (cmd == null) {
			return;
		}
		App.systemAgent.agentControl.invokeCommand (App.systemAgent.agentId, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult).catch ((err) => {
			Log.debug (`${this.toString ()} failed to invoke PlayCacheStream; err=${err}`);
		});
	}
}
module.exports = StreamCacheDisplayIntent;
