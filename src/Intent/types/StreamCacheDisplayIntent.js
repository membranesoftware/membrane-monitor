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
const FsUtil = require (Path.join (App.SOURCE_DIRECTORY, "FsUtil"));
const SystemInterface = require (Path.join (App.SOURCE_DIRECTORY, "SystemInterface"));
const IntentBase = require (Path.join (App.SOURCE_DIRECTORY, "Intent", "IntentBase"));

const MinRestingPeriod = 5000; // milliseconds

// Stage names
const Initializing = "initializing";
const Initializing2 = "initializing2";
const Playing = "playing";
const Resting = "resting";

class StreamCacheDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.displayName = App.uiText.getText ("StreamCacheDisplayIntentName");
		this.stateType = "StreamCacheDisplayIntentState";
		this.isDisplayIntent = true;

		// Read-only data members
		this.isPaused = false;
		this.lastCommandTime = 0;
		this.nextCommandTime = 0;
		this.lastPauseTime = 0;
		this.cacheMtime = 0;

		this.cacheDataPath = Path.join (App.DATA_DIRECTORY, App.StreamCachePath);
		this.items = [ ];
		this.itemChoices = [ ];
		this.monitorStatus = { };
	}

	// Configure the intent's state using values in the provided params object
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
	}

	// Execute actions appropriate when the intent becomes active
	doStart () {
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

	// Execute actions appropriate for the current state of the application
	doUpdate () {
		if (! this.isDisplayConditionActive) {
			this.setPaused (false);
			this.clearStage ();
			return;
		}
		const monitorstatus = App.systemAgent.agentControl.getLocalAgent ().lastStatus.monitorServerStatus;
		if ((typeof monitorstatus != "object") || (monitorstatus == null)) {
			this.setPaused (false);
			this.clearStage ();
			return;
		}
		this.monitorStatus = monitorstatus;
		if (this.stage == "") {
			this.setStage (Initializing);
		}
	}

	// Read entries from the stream cache and update the choice list if needed
	async readStreamCache () {
		const mtime = this.monitorStatus.cacheMtime;
		if (this.cacheMtime == mtime) {
			return;
		}
		const files = await FsUtil.readDirectory (this.cacheDataPath);
		this.items = files.filter ((file) => {
			return (App.systemAgent.getUuidCommand (file) == SystemInterface.CommandId.StreamItem);
		});
		this.itemChoices = [ ];
		this.cacheMtime = mtime;
	}

	// Stage methods
	initializing () {
		this.isPaused = false;
		this.stageAwait (this.readStreamCache (), Initializing2);
	}

	initializing2 () {
		if (this.stagePromiseError != null) {
			Log.debug (`${this.toString ()} readStreamCacheComplete failed to read stream cache; err=${this.stagePromiseError}`);
			this.items = [ ];
			this.itemChoices = [ ];
		}
		if (this.items.length <= 0) {
			this.stageAwait (this.timeoutWait (MinRestingPeriod), Initializing);
		}
		else {
			this.setStage (Playing);
		}
	}

	playing () {
		const id = this.state.isShuffle ?
			this.getRandomChoice (this.items, this.itemChoices) :
			this.getSequentialChoice (this.items, this.itemChoices);
		if (typeof id != "string") {
			this.setStage (Initializing);
			return;
		}
		const params = {
			streamId: id
		};
		if ((this.state.minStartPositionDelta > 0) || (this.state.maxStartPositionDelta > 0)) {
			params.minStartPositionDelta = this.state.minStartPositionDelta;
			params.maxStartPositionDelta = this.state.maxStartPositionDelta;
		}
		const cmd = App.systemAgent.createCommand ("PlayCacheStream", params);
		if (cmd == null) {
			return;
		}
		App.systemAgent.agentControl.invokeCommand (App.systemAgent.agentId, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult).catch ((err) => {
			Log.debug (`${this.toString ()} failed to invoke PlayCacheStream; err=${err}`);
		});

		this.lastCommandTime = this.updateTime;
		this.nextCommandTime = this.updateTime + App.systemAgent.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
		this.stageAwait (this.readStreamCache (), Resting);
	}

	resting () {
		if (! this.hasTimeElapsed (this.lastCommandTime, MinRestingPeriod)) {
			return;
		}
		if (this.isPaused) {
			return;
		}
		if (this.monitorStatus.displayState !== SystemInterface.Constant.PlayMediaDisplayState) {
			this.setStage (Playing);
			return;
		}
		if (this.updateTime >= this.nextCommandTime) {
			this.setStage (Playing);
			return;
		}
	}
}
module.exports = StreamCacheDisplayIntent;
