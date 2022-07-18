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
const SystemInterface = require (Path.join (App.SOURCE_DIRECTORY, "SystemInterface"));
const RepeatTask = require (Path.join (App.SOURCE_DIRECTORY, "RepeatTask"));
const IntentBase = require (Path.join (App.SOURCE_DIRECTORY, "Intent", "IntentBase"));

const MinRestingPeriod = 5000; // milliseconds
const GetStatusPeriod = 60000; // milliseconds

// Stage names
const Initializing = "initializing";
const Initializing2 = "initializing2";
const Resting = "resting";
const ShowingImage = "showingImage";

class CameraImageDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.displayName = App.uiText.getText ("CameraImageDisplayIntentName");
		this.stateType = App.uiText.getText ("CameraImageDisplayIntentState");
		this.isDisplayIntent = true;
		this.agentStatus = { };
		this.sensorStatus = { };
		this.monitorStatus = { };
		this.lastCommandTime = 0;
		this.lastDisplayCaptureTime = 0;
		this.nextCaptureTime = 0;
		this.getStatusTask = new RepeatTask ();
		this.getStatusTask.setAsync ((err) => {
		});
	}

	// Configure the intent's state using values in the provided params object
	doConfigure (configParams) {
		this.state.sensor = configParams.sensor;
		this.state.host = configParams.host;
	}

	// Execute actions appropriate when the intent becomes inactive
	doStop () {
		this.getStatusTask.stop ();
	}

	// Execute actions appropriate when the intent becomes active
	doStart () {
		if (typeof this.state.sensor != "number") {
			this.state.sensor = 0;
		}
		if (this.state.sensor < 0) {
			this.state.sensor = 0;
		}
	}

	// Execute actions appropriate for the current state of the application
	doUpdate () {
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
		if (this.state.host == null) {
			return;
		}
		this.lastCommandTime = 0;
		this.lastDisplayCaptureTime = 0;
		this.nextCaptureTime = 0;
		this.agentStatus = { };
		this.sensorStatus = { };
		this.stageAwait (App.systemAgent.agentControl.invokeHostCommand (this.state.host, SystemInterface.Constant.DefaultInvokePath, App.systemAgent.createCommand (SystemInterface.CommandId.GetStatus), SystemInterface.CommandId.AgentStatus), Initializing2);
	}

	initializing2 () {
		this.agentStatus = this.stagePromiseResult;
		if (this.agentStatus == null) {
			this.stageAwait (this.timeoutWait (60000), Initializing);
			return;
		}
		const sensor = this.agentStatus.params.cameraServerStatus.sensors[this.state.sensor];
		if (sensor == null) {
			this.stageAwait (this.timeoutWait (180000), Initializing);
			return;
		}
		this.sensorStatus = sensor;
		if (this.sensorStatus.isCapturing && (typeof this.sensorStatus.lastCaptureTime == "number") && (typeof this.sensorStatus.capturePeriod == "number")) {
			this.nextCaptureTime = this.sensorStatus.lastCaptureTime + (this.sensorStatus.capturePeriod * 1000) + MinRestingPeriod;
		}

		this.getStatusTask.setOnDemand (async () => {
			const result = await (App.systemAgent.agentControl.invokeHostCommand (this.state.host, SystemInterface.Constant.DefaultInvokePath, App.systemAgent.createCommand (SystemInterface.CommandId.GetStatus), SystemInterface.CommandId.AgentStatus));
			this.agentStatus = result;
			const sensor = this.agentStatus.params.cameraServerStatus.sensors[this.state.sensor];
			if (sensor != null) {
				this.sensorStatus = sensor;
				if (this.sensorStatus.isCapturing && (typeof this.sensorStatus.lastCaptureTime == "number") && (typeof this.sensorStatus.capturePeriod == "number")) {
					this.nextCaptureTime = this.sensorStatus.lastCaptureTime + (this.sensorStatus.capturePeriod * 1000) + MinRestingPeriod;
				}
			}
		});
		this.getStatusTask.setNextRepeat (GetStatusPeriod);
		this.setStage (Resting);
	}

	resting () {
		if (! this.hasTimeElapsed (this.lastCommandTime, MinRestingPeriod)) {
			return;
		}
		if (this.monitorStatus.displayState !== SystemInterface.Constant.ShowImageDisplayState) {
			this.setStage (ShowingImage);
			return;
		}
		if (typeof this.sensorStatus.lastCaptureTime == "number") {
			if (this.sensorStatus.lastCaptureTime != this.lastDisplayCaptureTime) {
				this.setStage (ShowingImage);
				return;
			}
		}

		if (this.nextCaptureTime > 0) {
			const delta = this.nextCaptureTime - this.updateTime;
			this.getStatusTask.advanceNextRepeat ((delta > 1) ? delta : 1);
			this.nextCaptureTime = 0;
		}
		else if (this.getStatusTask.nextExecuteTime <= 0) {
			this.getStatusTask.advanceNextRepeat (GetStatusPeriod);
		}
	}

	showingImage () {
		const params = {
			host: this.state.host,
			sensor: this.state.sensor
		};
		if (typeof this.sensorStatus.lastCaptureTime == "number") {
			params.displayTimestamp = this.sensorStatus.lastCaptureTime;
		}
		const cmd = App.systemAgent.createCommand (SystemInterface.CommandId.ShowCameraImage, params);
		if (cmd == null) {
			this.clearStage ();
			return;
		}
		this.lastCommandTime = this.updateTime;
		if (typeof this.sensorStatus.lastCaptureTime == "number") {
			this.lastDisplayCaptureTime = this.sensorStatus.lastCaptureTime;
		}
		this.stageAwait (App.systemAgent.agentControl.invokeCommand (App.systemAgent.agentId, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult), Resting);
	}
}
module.exports = CameraImageDisplayIntent;
