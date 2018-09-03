// Base class for server objects

"use strict";

var App = global.App || { };
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");

class ServerBase {
	constructor () {
		// Set this value to specify the server's name, usually expected to match its class name
		this.name = "ServerBase";

		// Set this value to specify the server's description
		this.description = "";

		// Populate this list with SystemInterface Type field items to specify parameters acceptable for server configuration
		this.configureParams = [ ];

		// Set values in this map for use as default configuration parameters
		this.baseConfiguration = { };

		// Fields in this object are set by the configure method, using items from the configureParams list
		this.configureMap = { };

		// Fields in this object are set by the configure method, storing fields that differ from the base configuration
		this.deltaConfiguration = { };

		// Set values in this map that should be included in status report strings
		this.statusMap = { };

		// Set this value to indicate whether the server has been configured with valid parameters
		this.isConfigured = false;

		// Set this value to indicate whether the server is running
		this.isRunning = false;
	}

	// Return a string representation of the server
	toString () {
		let s;

		s = "<" + this.name;
		if (Object.keys (this.statusMap).length > 0) {
			s += " " + JSON.stringify (this.statusMap);
		}
		s += ">";

		return (s);
	}

	// Return the AgentConfiguration field name that holds configuration values for servers of this type
	getAgentConfigurationKey () {
		return (this.name.substring (0, 1).toLowerCase () + this.name.substring (1) + "Configuration");
	}

	// Configure the server using values in the provided params object and set the isConfigured data member to reflect whether the configuration was successful
	configure (configParams) {
		let fields;

		if ((typeof configParams != "object") || (configParams == null)) {
			configParams = { };
		}

		fields = this.parseConfiguration (configParams);
		if (SystemInterface.isError (fields)) {
			Log.write (Log.ERR, `${this.toString ()} Configuration parse error: ${fields}`);
			return;
		}

		this.configureMap = fields;
		this.deltaConfiguration = configParams;
		this.isConfigured = true;
		Log.write (Log.DEBUG, `${this.toString ()} configured; baseConfiguration=${JSON.stringify (this.baseConfiguration)} deltaConfiguration=${JSON.stringify (this.deltaConfiguration)} configureMap=${JSON.stringify (this.configureMap)}`);
	}

	// Return an object containing configuration fields parsed from the server's base configuration combined with the provided parameters, or an error message if the parse failed
	parseConfiguration (configParams) {
		let c;

		c = { };
		for (let i in this.baseConfiguration) {
			c[i] = this.baseConfiguration[i];
		}
		if ((typeof configParams == "object") && (configParams != null)) {
			for (let i in configParams) {
				c[i] = configParams[i];
			}
		}

		return (SystemInterface.parseFields (this.configureParams, c));
	}

	// Return a boolean value indicating if the provided object contains valid configuration parameters
	isConfigurationValid (configParams) {
		return (! SystemInterface.isError (this.parseConfiguration (configParams)));
	}

	// Start the server's operation and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred). If the start operation succeeds, isRunning is set to true.
	start (startCallback) {
		if (! this.isConfigured) {
			process.nextTick (function () {
				startCallback ("Invalid configuration");
			});
			return;
		}

		this.doStart (startCallback);
	}

	// Start the server's operation and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred). If the start operation succeeds, isRunning is set to true.
	doStart (startCallback) {
		// Default implementation does nothing
		process.nextTick (startCallback);
	}

	// Stop the server's operation and set isRunning to false, and invoke the provided callback when complete
	stop (stopCallback) {
		// Default implementation clears isRunning and takes no other action
		this.isRunning = false;
		process.nextTick (stopCallback);
	}

	// Return a command invocation containing the server's status, or null if the server is not active
	getStatus () {
		if (! this.isRunning) {
			return (null);
		}

		return (this.doGetStatus ());
	}

	// Return a command invocation containing the server's status
	doGetStatus () {
		// Default implementation returns null
		return (null);
	}

	// Set a server status field in the provided AgentStatus params object
	setStatus (fields) {
		let cmd, fieldname;

		cmd = this.getStatus ();
		if (cmd == null) {
			return;
		}

		fieldname = this.name.substring (0, 1).toLowerCase () + this.name.substring (1) + "Status";
		fields[fieldname] = cmd.params;
	}

	// Provide server configuration data by adding an appropriate field to an AgentConfiguration params object, or take no action if no server-specific configuration data exists
	getConfiguration (agentConfiguration) {
		let c;

		c = { };
		for (let i in this.deltaConfiguration) {
			c[i] = this.deltaConfiguration[i];
		}
		this.doGetConfiguration (c);
		if (Object.keys (c).length > 0) {
			agentConfiguration[this.getAgentConfigurationKey ()] = c;
		}
	}

	// Add subclass-specific fields to the provided server configuration object, covering default values not present in the delta configuration
	doGetConfiguration (fields) {
		// Default implementation does nothing
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

	// Publish a WriteEvents command containing a record with the provided fields. If isClosed is true, the record prefix is set to reflect a closed state.
	publishRecord (recordId, recordTime, commandName, commandType, commandParams, isClosed) {
		let cmd, result;

		cmd = this.createCommand (commandName, commandType, commandParams);
		if (cmd == null) {
			return;
		}
		SystemInterface.setRecordFields (cmd, recordId, recordTime);
		if (isClosed === true) {
			SystemInterface.closeRecord (cmd);
		}

		result = App.systemAgent.publishWriteEvents ([cmd]);
		if (result != Result.SUCCESS) {
			// TODO: Possibly store the event and try to write it again later
			Log.write (Log.ERR, this.toString () + " Failed to write event record; recordId=\"" + recordId + "\" commandName=\"" + commandName + "\"");
		}
	}
}

module.exports = ServerBase;
