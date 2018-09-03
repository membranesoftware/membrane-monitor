// Class that tracks the state of remote system agents

"use strict";

var App = global.App || { };
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var MapUtil = require (App.SOURCE_DIRECTORY + "/MapUtil");
var Agent = require (App.SOURCE_DIRECTORY + "/Agent");
var SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");

class AgentControl {
	constructor () {
		// A map of URL hostname values to Agent objects
		this.agentMap = { };
	}

	// Return a string representation of the object
	toString () {
		return ("<AgentControl>");
	}

	// Store data received with an AgentStatus command
	updateAgentStatus (statusCommand) {
		let item;

		function createAgent () {
			return (new Agent ());
		}
		item = MapUtil.getItem (this.agentMap, statusCommand.params.urlHostname, createAgent);
		item.lastStatusCommand = statusCommand;
		item.lastStatusTime = new Date ().getTime ();
		SystemInterface.copyFields ("AgentStatus", item, statusCommand.params);
		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG3, this.toString () + " updateAgentStatus; urlHostname=\"" + statusCommand.params.urlHostname + "\" statusCommand=" + JSON.stringify (statusCommand) + " agent=" + item.toString ());
		}
	}

	// Return an array containing agents that cause the provided predicate function to generate a true value
	findAgents (matchFunction) {
		let i, item, m;

		m = [ ];
		for (i in this.agentMap) {
			item = this.agentMap[i];
			if (matchFunction (item)) {
				m.push (item);
			}
		}

		return (m);
	}
}

module.exports = AgentControl;
