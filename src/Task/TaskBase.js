// Base class for tasks

"use strict";

var App = global.App || { };
var Crypto = require ("crypto");
var Fs = require ("fs");
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");

class TaskBase {
	constructor () {
		// Set this value to specify the task's name
		this.name = "Task";

		// Set this value to specify the task's ID (a UUID string)
		this.id = "00000000-0000-0000-0000-000000000000";

		// Set this value to specify the task's description
		this.description = "";

		// Set this value to specify the task's subtitle
		this.subtitle = "";

		// Populate this list with strings to specify metadata tags that apply to the task
		this.tags = [ ];

		// Populate this list with SystemInterface Type field items to specify parameters acceptable for task configuration
		this.configureParams = [ ];

		// Fields in this object are set by the configure method, using items from the configureParams list
		this.configureMap = { };

		// Set values in this map that should be included in status report strings
		this.statusMap = { };

		// This value holds the task's start time
		this.startTime = 0;

		// This value holds the task's end time
		this.endTime = 0;

		// Set this value to a function that should be executed when the task ends, providing the task object as a function argument
		this.endCallback = null;

		// This value indicates if the task is running
		this.isRunning = false;

		// This value indicates if the task completed successfully
		this.isSuccess = false;

		// This value indicates if the task has been cancelled
		this.isCancelled = false;

		// Set this value to a SystemInterface type name that will be stored in resultObject if the task succeeds
		this.resultObjectType = "";

		// Set this value to an object containing information about the task's result, suitable for reference in an end callback
		this.resultObject = { };

		// Set this value to specify the command type that should be used in TaskItem records created from the task
		this.recordCommandType = SystemInterface.Constant.DefaultCommandType;
	}

	// Return a string representation of the task
	toString () {
		let s;

		s = `<Task id=${this.id} name="${this.name}" tags=${JSON.stringify (this.tags)}`;
		if (Object.keys (this.statusMap).length > 0) {
			s += " " + JSON.stringify (this.statusMap);
		}
		if (this.isRunning) {
			s += " isRunning";
		}
		if (this.isCancelled) {
			s += " isCancelled";
		}
		if (this.isSuccess) {
			s += " isSuccess";
		}
		s += ">";

		return (s);
	}

	// Configure the task using values in the provided params object. Returns a Result value.
	configure (configParams) {
		let fields;

		fields = SystemInterface.parseFields (this.configureParams, configParams);
		if (SystemInterface.isError (fields)) {
			Log.write (Log.ERR, `${this.toString ()} Configuration parse error; configParams=${JSON.stringify (configParams)} err=${fields}`);
			return (Result.INVALID_PARAMS);
		}

		this.configureMap = fields;
		Log.write (Log.DEBUG, this.toString () + " configured: " + JSON.stringify (this.configureMap));

		return (Result.SUCCESS);
	}

	// Return a SystemInterface TaskItem object with fields populated from the task
	getTaskItem () {
		return ({
			id: this.id,
			name: this.name,
			subtitle: this.subtitle,
			tags: this.tags,
			description: this.description,
			percentComplete: this.getPercentComplete ()
		});
	}

	// Execute the task's operations and invoke the end method when complete
	run () {
		if (this.isRunning) {
			return;
		}

		this.isRunning = true;
		this.statusMap["isRunning"] = true;
		this.startTime = new Date ().getTime ();
		this.setPercentComplete (0);

		Log.write (Log.DEBUG, this.toString () + " Begin");
		this.doRun ();
	}

	// Execute operations to end a task run
	end () {
		let result;

		this.isRunning = false;
		delete (this.statusMap["isRunning"]);
		this.endTime = new Date ().getTime ();

		if (this.isSuccess && (this.resultObjectType != "")) {
			result = SystemInterface.parseTypeObject (this.resultObjectType, this.resultObject);
			if (SystemInterface.isError (result)) {
				this.isSuccess = false;
				Log.write (Log.ERR, this.toString () + " result object failed validation; resultObjectType=\"" + this.resultObjectType + "\" err=\"" + result + "\"");
			}
		}
		Log.write (Log.DEBUG, this.toString () + " end; isSuccess=" + this.isSuccess);

		this.doEnd ();
		if (typeof this.endCallback == "function") {
			this.endCallback (this);
		}
	}

	// Cancel the task run
	cancel () {
		if (this.isCancelled) {
			return;
		}

		this.isCancelled = true;
		this.doCancel ();
	}

	// Subclass method. Implementations should execute task actions and call end when complete.
	doRun (cmdInv) {
		// Default implementation does nothing
		process.nextTick (() => {
			this.isSuccess = true;
			this.end ();
		});
	}

	// Subclass method. Implementations should execute actions appropriate when the task has been cancelled.
	doCancel () {
		// Default implementation does nothing
	}

	// Subclass method. Implementations should execute actions appropriate when the task has ended.
	doEnd () {
		// Default implementation does nothing
	}

	// Return the percent complete value for the task
	getPercentComplete () {
		return (typeof this.statusMap.percentComplete == "number" ? this.statusMap.percentComplete : 0);
	}

	// Set the percent complete value for the task
	setPercentComplete (value) {
		this.statusMap.percentComplete = value;
	}
}
module.exports = TaskBase;
