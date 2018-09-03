// Base class for intents to be run by a master server

"use strict";

var App = global.App || { };
var UuidV4 = require ("uuid/v4");
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var AgentControl = require (App.SOURCE_DIRECTORY + "/AgentControl");
var SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");

const UPDATE_LOG_PERIOD = 120000; // milliseconds

class IntentBase {
	constructor () {
		// Reset this AgentControl object to manipulate the intent's agent visibility and usage
		this.agentControl = new AgentControl ();

		// Set this value to specify the intent's ID (a UUID string)
		this.id = "00000000-0000-0000-0000-000000000000";

		// Set this value to specify the intent's name
		this.name = "Intent";

		// Set this value to specify the intent's display name
		this.displayName = "Job";

		// Set this value to specify whether the intent should be active. If inactive, the intent does not execute its update loop.
		this.isActive = true;

		// Set this value to specify the intent's description
		this.description = "";

		// An object used for holding persistent state associated with the intent, to be written as a record in the data store. Note that a MongoDB data store limits records to 16MB in size; intents should take care to keep state data below that maximum.
		this.state = { };

		// Set this value to a SystemInterface type that should be applied for parsing the state object
		this.stateType = "";

		// This value holds the current time during update calls
		this.updateTime = 0;

		// This value holds the next time the update method should log a debug status message
		this.nextUpdateLogTime = 0;

		// Set values in this map for inclusion in status report strings
		this.statusMap = { };
	}

	// Configure the intent's state using values in the provided params object. Returns a Result value.
	configure (configParams) {
		if (typeof configParams.displayName == "string") {
			this.displayName = configParams.displayName;
		}
		return (this.doConfigure (configParams));
	}

	// Configure the intent's state using values in the provided params object and return a Result value. Subclasses are expected to implement this method.
	doConfigure (configParams) {
		// Default implementation does nothing
		return (Result.SUCCESS);
	}

	// Return a string description of the intent
	toString () {
		let s, keys, i;

		s = "<Intent id=" + this.id + " name=" + this.name;
		keys = Object.keys (this.statusMap);
		if (keys.length > 0) {
			keys.sort ();
			for (i = 0; i < keys.length; ++i) {
				s += " " + keys[i] + "=\"" + this.statusMap[keys[i]] + "\"";
			}
		}
		s += ">";

		return (s);
	}

	// Return an object containing fields from the intent, suitable for use as parameters in an IntentState command
	getIntentState () {
		let state;

		if (this.stateType == "") {
			state = this.state;
		}
		else {
			state = SystemInterface.parseTypeObject (this.stateType, this.state);
			if (SystemInterface.isError (state)) {
				state = { };
			}
		}

		return ({
			id: this.id,
			name: this.name,
			displayName: this.displayName,
			isActive: this.isActive,
			state: state
		});
	}

	// Reset fields in the intent using values from the provided IntentState params object
	readIntentState (intentState) {
		let state;

		this.id = intentState.id;
		this.name = intentState.name;
		this.displayName = intentState.displayName;
		this.isActive = intentState.isActive;

		if (this.stateType == "") {
			this.state = intentState.state;
		}
		else {
			state = SystemInterface.parseTypeObject (this.stateType, intentState.state);
			if (SystemInterface.isError (state)) {
				Log.write (Log.WARNING, this.toString () + " failed to parse state object from storage; err=" + state + " state=" + JSON.stringify (intentState.state));
				state = { };
			}

			this.state = state;
		}
	}

	// If the intent holds an empty ID value, assign a new one
	assignId () {
		if (this.id == "00000000-0000-0000-0000-000000000000") {
			this.id = UuidV4 ();
		}
	}

	// Perform actions appropriate for the current state of the application
	update () {
		let now;

		if (! this.isActive) {
			return;
		}

		now = new Date ().getTime ();
		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, this.toString () + " update");
		}
		if (now >= this.nextUpdateLogTime) {
			// Adding random jitter to this delay
			this.nextUpdateLogTime = now + UPDATE_LOG_PERIOD + App.systemAgent.getRandomInteger (0, 12000);
			Log.write (Log.DEBUG, this.toString () + " active");
		}

		this.updateTime = now;
		this.doUpdate ();
	}

	// Perform actions appropriate for the current state of the application. Subclasses are expected to implement this method.
	doUpdate () {
		// Default implementation does nothing
	}

	// Set the intent's active state
	setActive (isActive) {
		if (this.isActive == isActive) {
			return;
		}

		this.isActive = isActive;
		this.activeStateChanged ();
	}

	// Perform actions appropriate when the intent's active state has changed
	activeStateChanged () {
		// Default implementation does nothing
	}

	// Return a boolean value indicating if the task's last update time indicates that the specified time period has elapsed. startTime and period are both measured in milliseconds.
	hasTimeElapsed (startTime, period) {
		let diff;

		diff = this.updateTime - startTime;
		return (diff >= period);
	}

	// Return an object containing a command with the default agent prefix and the provided parameters, or null if the command could not be validated, in which case an error log message is generated
	createCommand (commandName, commandType, commandParams) {
		let cmd;

		cmd = SystemInterface.createCommand (App.systemAgent.getCommandPrefix (), commandName, commandType, commandParams);
		if (SystemInterface.isError (cmd)) {
			Log.write (Log.ERR, this.toString () + " failed to create command invocation: " + cmd);
			return (null);
		}

		return (cmd);
	}

	// Return a boolean value indicating if the provided item is an object and is not null
	isObject (obj) {
		return ((typeof obj == "object") && (obj != null));
	}

	// Return a boolean value indicating if the provided item is an array with no contents other than strings
	isStringArray (obj) {
		if (! Array.isArray (obj)) {
			return (false);
		}

		for (let i of obj) {
			if (typeof i != "string") {
				return (false);
			}
		}

		return (true);
	}

	// Suspend all items in the provided map of RepeatTasks items
	suspendTasks (taskMap) {
		let i, task;

		for (i in taskMap) {
			task = taskMap[i];
			task.suspendRepeat ();
		}
	}

	// Resume all items in the provided map of RepeatTasks items
	resumeTasks (taskMap) {
		let i, task;

		for (i in taskMap) {
			task = taskMap[i];
			task.setNextRepeat (0);
		}
	}

	// Return a newly created array with the same contents as the provided source array
	copyArray (sourceArray) {
		let a, i;

		a = [ ];
		for (i = 0; i < sourceArray.length; ++i) {
			a.push (sourceArray[i]);
		}
		return (a);
	}

	// Return an object containing a command with the default agent prefix and the provided parameters, or null if the command could not be validated, in which case an error log message is generated
	createCommand (commandName, commandType, commandParams) {
		let cmd;

		cmd = SystemInterface.createCommand (App.systemAgent.getCommandPrefix (), commandName, commandType, commandParams);
		if (SystemInterface.isError (cmd)) {
			Log.write (Log.ERR, this.toString () + " failed to create command invocation; commandName=" + commandName + " err=\"" + cmd + "\"");
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.ERR, this.toString () + " createCommand call stack; commandName=" + commandName + "\n" + new Error ().stack);
			}
			return (null);
		}

		return (cmd);
	}
}

module.exports = IntentBase;
