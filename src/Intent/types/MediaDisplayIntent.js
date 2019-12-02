/*
* Copyright 2018-2019 Membrane Software <author@membranesoftware.com> https://membranesoftware.com
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
const Fs = require ("fs");
const Result = require (App.SOURCE_DIRECTORY + "/Result");
const Log = require (App.SOURCE_DIRECTORY + "/Log");
const SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");
const Agent = require (App.SOURCE_DIRECTORY + "/Intent/Agent");
const AgentControl = require (App.SOURCE_DIRECTORY + "/Intent/AgentControl");
const Task = require (App.SOURCE_DIRECTORY + "/Task/Task");
const HlsIndexParser = require (App.SOURCE_DIRECTORY + "/HlsIndexParser");
const IntentBase = require (App.SOURCE_DIRECTORY + "/Intent/IntentBase");

const AGENT_TIMEOUT_PERIOD = 60000; // milliseconds
const AGENT_COMMAND_WAIT_PERIOD = 5000; // milliseconds

class MediaDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.name = "MediaDisplayIntent";
		this.displayName = "Play video streams";
		this.stateType = "MediaDisplayIntentState";
	}

	// Perform actions appropriate when the intent becomes active
	doStart () {
		this.lastCommandTimeMap = { };
		if (App.AUTHORIZE_SECRET == "") {
			this.authToken = "";
		}
		else {
			this.authToken = App.systemAgent.accessControl.createSession ();
			App.systemAgent.accessControl.setSessionSustained (this.authToken, true);
		}
	}

	// Perform actions appropriate when the intent becomes inactive
	doStop () {
		if (this.authToken != "") {
			App.systemAgent.accessControl.setSessionSustained (this.authToken, false);
			this.authToken = "";
		}
	}

	// Configure the intent's state using values in the provided params object and return a Result value
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

		return (Result.SUCCESS);
	}

	// Perform actions appropriate for the current state of the application
	doUpdate () {
		let agents;

		if (! Array.isArray (this.state.items)) {
			this.state.items = [ ];
		}
		if (! Array.isArray (this.state.itemChoices)) {
			this.state.itemChoices = [ ];
		}
		if (typeof this.state.isShuffle != "boolean") {
			this.state.isShuffle = false;
		}
		if ((typeof this.state.agentMap != "object") || (this.state.agentMap == null)) {
			// A map of agent ID values to timestamp values, indicating when each agent's next display command should be invoked
			this.state.agentMap = { };
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

		agents = this.findAgents ((a) => {
			let t;

			if ((this.updateTime - a.lastStatusTime) >= AGENT_TIMEOUT_PERIOD) {
				return (false);
			}

			t = this.lastCommandTimeMap[a.agentId];
			if ((typeof t == "number") && ((t + AGENT_COMMAND_WAIT_PERIOD) > this.updateTime)) {
				return (false);
			}

			if ((typeof a.lastStatus.monitorServerStatus == "object") && (a.lastStatus.monitorServerStatus != null)) {
				if (! a.lastStatus.monitorServerStatus.isPlaying) {
					return (true);
				}
			}

			t = this.state.agentMap[a.agentId];
			if ((typeof t == "number") && (this.updateTime < t)) {
				return (false);
			}

			return (true);
		});

		for (let agent of agents) {
			this.playNextItem (agent);
		}
	}

	// Select a stream item and execute a play command on the provided target agent
	playNextItem (agent) {
		let curindex, item;

		if (this.state.itemChoices.length <= 0) {
			this.state.itemChoices = this.createChoiceArray (this.state.items);
			if (this.state.itemChoices.length <= 0) {
				return;
			}
		}

		if (this.state.isShuffle) {
			curindex = this.getRandomChoice (this.state.itemChoices);
		}
		else {
			curindex = this.state.itemChoices.shift ();
		}
		if ((curindex < 0) || (curindex >= this.state.items.length)) {
			return;
		}

		item = this.state.items[curindex];
		if (item.streamUrl != "") {
			this.executePlayMedia (agent, item);
		}
		else if (item.streamId != "") {
			this.executePlayCacheStream (agent, item);
		}
	}

	// Execute a PlayMedia command for the provided target agent and stream item
	executePlayMedia (agent, item) {
		let cmd, params, playcmd, playparams, streamurl, thumbnailcmd;

		streamurl = item.streamUrl;
		if (item.streamId != "") {
			playparams = {
				streamId: item.streamId
			};
			if (typeof item.startPosition == "number") {
				playparams.startPosition = item.startPosition;
			}
			if ((this.state.minStartPositionDelta > 0) || (this.state.maxStartPositionDelta > 0)) {
				playparams.minStartPositionDelta = this.state.minStartPositionDelta;
				playparams.maxStartPositionDelta = this.state.maxStartPositionDelta;
			}
			playcmd = App.systemAgent.createCommand ("GetHlsManifest", SystemInterface.Constant.Stream, playparams);
			if (playcmd == null) {
				return;
			}
			streamurl += "?" + SystemInterface.Constant.UrlQueryParameter + "=" + encodeURIComponent (JSON.stringify (playcmd));
		}

		params = {
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
			thumbnailcmd = App.systemAgent.createCommand ("GetThumbnailImage", SystemInterface.Constant.Stream, {
				id: item.streamId,
				thumbnailIndex: item.thumbnailIndex
			});
			if (thumbnailcmd != null) {
				params.thumbnailUrl = item.thumbnailUrl + "?" + SystemInterface.Constant.UrlQueryParameter + "=" + encodeURIComponent (JSON.stringify (thumbnailcmd));
			}
		}

		cmd = App.systemAgent.createCommand ("PlayMedia", SystemInterface.Constant.Monitor, params, App.AUTHORIZE_SECRET, this.authToken);
		if (cmd == null) {
			return;
		}

		this.lastCommandTimeMap[agent.agentId] = this.updateTime;
		this.state.agentMap[agent.agentId] = this.updateTime + App.systemAgent.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
		App.systemAgent.invokeAgentCommand (agent.urlHostname, agent.tcpPort1, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult, (err) => {
			if (err != null) {
				Log.debug (`${this.toString ()} failed to send PlayMedia command; err=${err}`);
			}
		});
	}

	// Execute a PlayCacheStream command for the provided target agent and stream item
	executePlayCacheStream (agent, item) {
		let cmd, params;

		params = {
			streamId: item.streamId
		};
		if (typeof item.startPosition == "number") {
			params.startPosition = item.startPosition;
		}
		if ((this.state.minStartPositionDelta > 0) || (this.state.maxStartPositionDelta > 0)) {
			params.minStartPositionDelta = this.state.minStartPositionDelta;
			params.maxStartPositionDelta = this.state.maxStartPositionDelta;
		}

		cmd = App.systemAgent.createCommand ("PlayCacheStream", SystemInterface.Constant.Monitor, params, App.AUTHORIZE_SECRET, this.authToken);
		if (cmd == null) {
			return;
		}

		this.lastCommandTimeMap[agent.agentId] = this.updateTime;
		this.state.agentMap[agent.agentId] = this.updateTime + App.systemAgent.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
		App.systemAgent.invokeAgentCommand (agent.urlHostname, agent.tcpPort1, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult, (err) => {
			if (err != null) {
				Log.debug (`${this.toString ()} failed to send PlayCacheStream command; err=${err}`);
			}
		});
	}
}
module.exports = MediaDisplayIntent;
