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

const AgentCommandWaitPeriod = 7000; // milliseconds
const AgentStatusWaitPeriod = 30000; // milliseconds

class CameraDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.displayName = "Show images from cameras";
		this.stateType = "CameraDisplayIntentState";
		this.isDisplayIntent = true;
	}

	// Configure the intent's state using values in the provided params object
	doConfigure (configParams) {
		if (Array.isArray (configParams.cameras)) {
			this.state.cameras = configParams.cameras;
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
	}

	// Perform actions appropriate when the intent becomes active
	doStart () {
		if (! Array.isArray (this.state.cameras)) {
			this.state.cameras = [ ];
		}
		if (! Array.isArray (this.state.cameraChoices)) {
			this.state.cameraChoices = [ ];
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
		this.currentCamera = null;
		this.currentCameraStatus = null;
		this.lastCaptureTime = 0;
		this.isRequestingStatus = false;
		this.nextStatusTime = -1;
		this.nextCameraChangeTime = -1;
		this.shouldShowImage = false;
	}

	// Perform actions appropriate when the intent becomes inactive
	doStop () {

	}

	// Perform actions appropriate for the current state of the application
	doUpdate () {
		let show;

		if (this.state.cameras.length <= 0) {
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

		this.updateCurrentCamera ();
		if (this.currentCamera == null) {
			return;
		}
		if (this.currentCameraStatus == null) {
			return;
		}

		show = false;
		if (monitorstatus.displayState !== SystemInterface.Constant.ShowImageDisplayState) {
			show = true;
		}
		if (this.shouldShowImage) {
			this.shouldShowImage = false;
			show = true;
		}
		if (! show) {
			return;
		}

		const cmd = App.systemAgent.createCommand ("ShowCameraImage", { host: this.currentCamera });
		if (cmd == null) {
			return;
		}
		App.systemAgent.agentControl.invokeCommand (App.systemAgent.agentId, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult).catch ((err) => {
			Log.debug (`${this.toString ()} failed to invoke ShowCameraImage; err=${err}`);
		});
		this.lastCommandTime = this.updateTime;
	}

	// Set currentCamera as appropriate for application state
	updateCurrentCamera () {
		let camera;

		if (this.state.cameras.length <= 0) {
			return;
		}
		if ((this.currentCamera == null) || ((this.nextCameraChangeTime >= 0) && (this.updateTime >= this.nextCameraChangeTime))) {
			if (this.state.isShuffle) {
				camera = this.getRandomChoice (this.state.cameras, this.state.cameraChoices);
			}
			else {
				camera = this.getSequentialChoice (this.state.cameras, this.state.cameraChoices);
			}
			if (this.currentCamera != camera) {
				this.currentCamera = camera;
				this.currentCameraStatus = null;
				this.lastCaptureTime = 0;
				this.nextStatusTime = this.updateTime;
			}

			if ((this.state.minItemDisplayDuration <= 0) || (this.state.maxItemDisplayDuration <= 0)) {
				this.nextCameraChangeTime = -1;
			}
			else {
				this.nextCameraChangeTime = this.updateTime + App.systemAgent.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
			}
		}
		if (this.currentCamera == null) {
			return;
		}

		if (! this.isRequestingStatus) {
			if ((this.nextStatusTime >= 0) && (this.updateTime >= this.nextStatusTime)) {
				this.isRequestingStatus = true;
				const host = this.currentCamera;
				App.systemAgent.agentControl.invokeHostCommand (host, SystemInterface.Constant.DefaultInvokePath, App.systemAgent.createCommand ("GetStatus"), SystemInterface.CommandId.AgentStatus).then ((responseCommand) => {
					if ((this.currentCamera == host) && (responseCommand.params.cameraServerStatus != null)) {
						this.currentCameraStatus = responseCommand.params.cameraServerStatus;

						if (this.lastCaptureTime != this.currentCameraStatus.lastCaptureTime) {
							this.lastCaptureTime = this.currentCameraStatus.lastCaptureTime;
							if (this.lastCaptureTime > 0) {
								this.shouldShowImage = true;
								this.nextStatusTime = Date.now () + (this.currentCameraStatus.capturePeriod * 1000);
							}
						}
						else {
							if (this.currentCameraStatus.capturePeriod <= 0) {
								this.nextStatusTime = Date.now () + AgentCommandWaitPeriod;
							}
							else {
								this.nextStatusTime = Date.now () + AgentStatusWaitPeriod;
							}
						}
					}
				}).catch ((err) => {
					Log.debug (`${this.toString ()} failed to invoke GetStatus; err=${err}`);
					this.nextStatusTime = Date.now () + AgentStatusWaitPeriod;
				}).then (() => {
					this.isRequestingStatus = false;
				});
			}
		}
	}
}
module.exports = CameraDisplayIntent;
