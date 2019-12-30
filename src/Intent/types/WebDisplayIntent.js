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
const Result = require (App.SOURCE_DIRECTORY + "/Result");
const Log = require (App.SOURCE_DIRECTORY + "/Log");
const SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");
const Agent = require (App.SOURCE_DIRECTORY + "/Intent/Agent");
const AgentControl = require (App.SOURCE_DIRECTORY + "/Intent/AgentControl");
const IntentBase = require (App.SOURCE_DIRECTORY + "/Intent/IntentBase");

const AGENT_TIMEOUT_PERIOD = 60000; // milliseconds
const AGENT_COMMAND_WAIT_PERIOD = 5000; // milliseconds

class WebDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.name = "WebDisplayIntent";
		this.displayName = "Track websites";
		this.stateType = "WebDisplayIntentState";
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

		return (Result.SUCCESS);
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

	// Perform actions appropriate for the current state of the application
	doUpdate () {
		let agents, cmd, url, curindex;

		if (! Array.isArray (this.state.urls)) {
			this.state.urls = [ ];
		}
		if (! Array.isArray (this.state.urlChoices)) {
			this.state.urlChoices = [ ];
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

			t = this.lastCommandTimeMap[a.agentId];
			if ((typeof t == "number") && ((t + AGENT_COMMAND_WAIT_PERIOD) > this.updateTime)) {
				return (false);
			}

			if ((typeof a.lastStatus.monitorServerStatus == "object") && (a.lastStatus.monitorServerStatus != null)) {
				if (! a.lastStatus.monitorServerStatus.isShowingUrl) {
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
			if (this.state.urlChoices.length <= 0) {
				this.state.urlChoices = this.createChoiceArray (this.state.urls);
				if (this.state.urlChoices.length <= 0) {
					break;
				}
			}

			this.state.agentMap[agent.agentId] = this.updateTime + App.systemAgent.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
			if (this.state.isShuffle) {
				curindex = this.getRandomChoice (this.state.urlChoices);
			}
			else {
				curindex = this.state.urlChoices.shift ();
			}
			if ((curindex < 0) || (curindex >= this.state.urls.length)) {
				continue;
			}

			url = this.state.urls[curindex];
			cmd = App.systemAgent.createCommand ("ShowWebUrl", SystemInterface.Constant.Monitor, { url: url }, App.AUTHORIZE_SECRET, this.authToken);
			if (cmd == null) {
				continue;
			}

			this.lastCommandTimeMap[agent.agentId] = this.updateTime;
			App.systemAgent.invokeAgentCommand (agent.urlHostname, agent.tcpPort1, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.CommandResult, (err) => {
				if (err != null) {
					Log.warn (`${this.toString ()} failed to send ShowWebUrl command; err=${err}`);
				}
			});
		}
	}
}
module.exports = WebDisplayIntent;
