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
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");
var Agent = require (App.SOURCE_DIRECTORY + "/Intent/Agent");
var AgentControl = require (App.SOURCE_DIRECTORY + "/Intent/AgentControl");
var IntentBase = require (App.SOURCE_DIRECTORY + "/Intent/IntentBase");

const AGENT_TIMEOUT_PERIOD = 60000; // milliseconds

class MediaDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.name = "MediaDisplayIntent";
		this.displayName = "Play video streams";
		this.description = "Show video stream content on display agents";
		this.stateType = "MediaDisplayIntentState";
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

		return (Result.SUCCESS);
	}

	// Perform actions appropriate for the current state of the application
	doUpdate () {
		let agents, cmd, curindex, item;

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

		agents = this.findAgents ((a) => {
			let t;

			if ((this.updateTime - a.lastStatusTime) >= AGENT_TIMEOUT_PERIOD) {
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
			if (this.state.itemChoices.length <= 0) {
				this.state.itemChoices = this.createChoiceArray (this.state.items);
				if (this.state.itemChoices.length <= 0) {
					break;
				}
			}

			if (this.state.isShuffle) {
				curindex = this.getRandomChoice (this.state.itemChoices);
			}
			else {
				curindex = this.state.itemChoices.shift ();
			}
			if ((curindex < 0) || (curindex >= this.state.items.length)) {
				continue;
			}

			this.state.agentMap[agent.agentId] = this.updateTime + App.systemAgent.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
			item = this.state.items[curindex];

			cmd = App.systemAgent.createCommand ("PlayMedia", SystemInterface.Constant.Monitor, {
				mediaName: item.mediaName,
				streamUrl: item.streamUrl
			});
			if (cmd == null) {
				continue;
			}

			App.systemAgent.invokeAgentCommand (agent.urlHostname, agent.tcpPort1, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult, (err) => {
				if (err != null) {
					Log.warn (`${this.toString ()} failed to send PlayMedia command; err=${err}`);
				}
			});
		}
	}
}
module.exports = MediaDisplayIntent;
