// Utility functions for Task objects

"use strict";

var App = global.App || { };
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var TaskTypes = require ('./types');

function Task () {

}

module.exports = Task;

Task.TaskTypes = TaskTypes;
exports.TaskTypes = TaskTypes;

// createTask - Create a new task of the specified type name and configure it with the provided parameters object. Returns null if the task could not be created, indicating that the type name was not found or the configuration was not valid.
Task.createTask = function (typeName, configureParams) {
	let tasktype, task;

	tasktype = Task.TaskTypes[typeName];
	if (tasktype == null) {
		return (null);
	}

	task = new tasktype ();
	if ((typeof configureParams != "object") || (configureParams == null)) {
		configureParams = { };
	}
	if (task.configure (configureParams) != Result.SUCCESS) {
		return (null);
	}

	return (task);
};
