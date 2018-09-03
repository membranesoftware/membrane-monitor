"use strict";

var App = global.App || { };
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");
var Agent = require (App.SOURCE_DIRECTORY + "/Agent");
var AgentControl = require (App.SOURCE_DIRECTORY + "/AgentControl");
var IntentBase = require (App.SOURCE_DIRECTORY + "/Intent/IntentBase");

const AGENT_TIMEOUT_PERIOD = 60000; // milliseconds

class WebDisplayIntent extends IntentBase {
	constructor () {
		super ();
		this.name = "WebDisplayIntent";
		this.displayName = "Track websites";
		this.description = "Show web content on display agents";
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
		let agents, cmd, url, pos;

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

		agents = this.agentControl.findAgents ((a) => {
			let t;

			if ((this.updateTime - a.lastStatusTime) >= AGENT_TIMEOUT_PERIOD) {
				return (false);
			}

			t = this.state.agentMap[a.id];
			if ((typeof t == "number") && (this.updateTime < t)) {
				return (false);
			}

			return (true);
		});

		for (let agent of agents) {
			if (this.state.urlChoices.length <= 0) {
				this.state.urlChoices = this.copyArray (this.state.urls);
				if (this.state.urlChoices.length <= 0) {
					break;
				}
			}

			this.state.agentMap[agent.id] = this.updateTime + App.systemAgent.getRandomInteger (this.state.minItemDisplayDuration * 1000, this.state.maxItemDisplayDuration * 1000);
			if (this.state.isShuffle) {
				pos = App.systemAgent.getRandomInteger (0, this.state.urlChoices.length - 1);
			}
			else {
				pos = 0;
			}
			url = this.state.urlChoices[pos];
			this.state.urlChoices.splice (pos, 1);
			cmd = this.createCommand ("ShowWebUrl", SystemInterface.Constant.Display, { url: url });
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG4, this.toString () + "; send ShowWebUrl command for agentName=" + agent.name + " url=" + url + " cmd=" + JSON.stringify (cmd));
			}
			if (cmd == null) {
				continue;
			}

			App.systemAgent.invokeAgentCommand (agent.urlHostname, agent.tcpPort, cmd, SystemInterface.CommandId.CommandResult, function (err) {
				if (err != null) {
					Log.write (Log.WARNING, this.toString () + " failed to send ShowWebUrl command; err=" + err);
				}
			});
		}
	}
}
module.exports = WebDisplayIntent;
