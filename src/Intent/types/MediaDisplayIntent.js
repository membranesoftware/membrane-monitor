/*
* Copyright 2018-2022 Membrane Software <author@membranesoftware.com> https://membranesoftware.com
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

const MinRestingPeriod = 5000; // milliseconds

// Stage names
const Playing = "playing";
const Resting = "resting";

class MediaDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.displayName = App.uiText.getText ("MediaDisplayIntentName");
		this.stateType = "MediaDisplayIntentState";
		this.isDisplayIntent = true;
		this.isPaused = false;
		this.lastCommandTime = 0;
		this.nextCommandTime = 0;
		this.lastPauseTime = 0;
		this.monitorStatus = { };
	}

	// Configure the intent's state using values in the provided params object
	doConfigure (configParams) {
		if (Array.isArray (configParams.items)) {
			this.state.items = configParams.items;
		}
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
		if (! Array.isArray (this.state.items)) {
			this.state.items = [ ];
		}
		if (! Array.isArray (this.state.itemChoices)) {
			this.state.itemChoices = [ ];
		}
		if (typeof this.state.isShuffle != "boolean") {
			this.state.isShuffle = false;
		}
		if (typeof this.state.minItemDisplayDuration != "number") {
			this.state.minItemDisplayDuration = 300;
		}
		else {
			if (this.state.minItemDisplayDuration < 0) {
				this.state.minItemDisplayDuration = 0;
			}
		}
		if (typeof this.state.maxItemDisplayDuration != "number") {
			this.state.maxItemDisplayDuration = 900;
		}
		else {
			if (this.state.maxItemDisplayDuration < 0) {
				this.state.maxItemDisplayDuration = 0;
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
		this.monitorStatus = { };
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
			if (this.nextCommandTime > 0) {
				this.nextCommandTime += (now - this.lastPauseTime);
			}
		}
	}

	// Execute actions appropriate for the current state of the application
	doUpdate () {
		if (this.state.items.length <= 0) {
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
			this.setStage (Playing);
		}
	}

	// Stage methods
	playing () {
		const item = this.state.isShuffle ?
			this.getRandomChoice (this.state.items, this.state.itemChoices) :
			this.getSequentialChoice (this.state.items, this.state.itemChoices);
		if (item == null) {
			this.clearStage ();
			return;
		}

		if (item.streamUrl != "") {
			this.executePlayMedia (item);
		}
		else if (item.streamId != "") {
			this.executePlayCacheStream (item);
		}
		this.lastCommandTime = this.updateTime;
		if ((this.state.minItemDisplayDuration <= 0) || (this.state.maxItemDisplayDuration <= 0)) {
			this.nextCommandTime = 0;
		}
		else {
			this.nextCommandTime = this.updateTime + App.systemAgent.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
		}
		this.setStage (Resting);
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
		if ((this.nextCommandTime > 0) && (this.updateTime >= this.nextCommandTime)) {
			this.setStage (Playing);
			return;
		}
	}

	// Execute a PlayMedia command for the provided stream item
	executePlayMedia (item) {
		let streamurl;

		streamurl = item.streamUrl;
		if (item.streamId != "") {
			const playparams = {
				streamId: item.streamId
			};
			if (typeof item.startPosition == "number") {
				playparams.startPosition = item.startPosition;
			}
			if ((this.state.minStartPositionDelta > 0) || (this.state.maxStartPositionDelta > 0)) {
				playparams.minStartPositionDelta = this.state.minStartPositionDelta;
				playparams.maxStartPositionDelta = this.state.maxStartPositionDelta;
			}
			const playcmd = App.systemAgent.createCommand (SystemInterface.CommandId.GetHlsManifest, playparams);
			if (playcmd == null) {
				return;
			}
			streamurl += `?${SystemInterface.Constant.UrlQueryParameter}=${encodeURIComponent (JSON.stringify (playcmd))}`;
		}

		const params = {
			mediaName: item.mediaName,
			streamUrl: streamurl
		};
		if (item.streamId != "") {
			params.streamId = item.streamId;
		}
		if (typeof item.startPosition == "number") {
			params.startPosition = item.startPosition;
		}
		if ((this.state.minStartPositionDelta > 0) || (this.state.maxStartPositionDelta > 0)) {
			params.minStartPositionDelta = this.state.minStartPositionDelta;
			params.maxStartPositionDelta = this.state.maxStartPositionDelta;
		}
		if ((item.streamId != "") && (typeof item.thumbnailUrl == "string") && (typeof item.thumbnailIndex == "number")) {
			const thumbnailcmd = App.systemAgent.createCommand (SystemInterface.CommandId.GetThumbnailImage, {
				id: item.streamId,
				thumbnailIndex: item.thumbnailIndex
			});
			if (thumbnailcmd != null) {
				params.thumbnailUrl = `${item.thumbnailUrl}?${SystemInterface.Constant.UrlQueryParameter}=${encodeURIComponent (JSON.stringify (thumbnailcmd))}`;
			}
		}

		const cmd = App.systemAgent.createCommand (SystemInterface.CommandId.PlayMedia, params);
		if (cmd == null) {
			return;
		}
		App.systemAgent.agentControl.invokeCommand (App.systemAgent.agentId, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult).catch ((err) => {
			Log.debug (`${this.toString ()} failed to invoke PlayMedia; err=${err}`);
		});
	}

	// Execute a PlayCacheStream command for the provided stream item
	executePlayCacheStream (item) {
		const params = {
			streamId: item.streamId
		};
		if (typeof item.startPosition == "number") {
			params.startPosition = item.startPosition;
		}
		if ((this.state.minStartPositionDelta > 0) || (this.state.maxStartPositionDelta > 0)) {
			params.minStartPositionDelta = this.state.minStartPositionDelta;
			params.maxStartPositionDelta = this.state.maxStartPositionDelta;
		}

		const cmd = App.systemAgent.createCommand (SystemInterface.CommandId.PlayCacheStream, params);
		if (cmd == null) {
			return;
		}
		App.systemAgent.agentControl.invokeCommand (App.systemAgent.agentId, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult).catch ((err) => {
			Log.debug (`${this.toString ()} failed to invoke PlayCacheStream; err=${err}`);
		});
	}
}
module.exports = MediaDisplayIntent;
