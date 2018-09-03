// Class that manages periodic and on-demand execution of a function

var App = global.App || { };
var Log = require (App.SOURCE_DIRECTORY + '/Log');

function RepeatTask () {
	this.taskFunction = function (callback) {
		process.nextTick (callback);
	};
	this.isExecuting = false;
	this.executeTimeout = null;
	this.isRepeating = false;
	this.isSuspended = false;
	this.nextRepeatPeriod = 0;
	this.minIntervalPeriod = 1000;
	this.maxIntervalPeriod = 2000;
}
module.exports = RepeatTask;

// setRepeating - Set the task for repeated execution at an interval period, specified in milliseconds. Task execution is performed using taskFunction, which must expect a single "callback" parameter for invocation when the task completes. maxIntervalPeriod can be omitted if a randomized repeat interval is not needed.
RepeatTask.prototype.setRepeating = function (taskFunction, minIntervalPeriod, maxIntervalPeriod) {
	var shouldexecute;

	shouldexecute = false;
	if ((! this.isRepeating) || (taskFunction != this.taskFunction)) {
		shouldexecute = true;
	}
	this.isRepeating = true;
	this.isSuspended = false;
	this.taskFunction = taskFunction;
	this.minIntervalPeriod = minIntervalPeriod;
	if (typeof maxIntervalPeriod == 'number') {
		this.maxIntervalPeriod = maxIntervalPeriod;
	}
	else {
		this.maxIntervalPeriod = minIntervalPeriod;
	}

	if (shouldexecute) {
		this.setNextRepeat (0);
	}
};

// execute - Execute the task
RepeatTask.prototype.execute = function () {
	var task;

	task = this;
	if (task.isExecuting) {
		return;
	}

	if (task.executeTimeout != null) {
		clearTimeout (task.executeTimeout);
		task.executeTimeout = null;
	}

	task.isExecuting = true;
	task.nextRepeatPeriod = 0;
	task.taskFunction (functionComplete, task);
	function functionComplete () {
		var delay;

		task.isExecuting = false;
		if (task.isRepeating && (! task.isSuspended)) {
			if (task.nextRepeatPeriod > 0) {
				delay = task.nextRepeatPeriod;
				task.nextRepeatPeriod = 0;
			}
			else {
				delay = task.minIntervalPeriod;
				if (task.maxIntervalPeriod > task.minIntervalPeriod) {
					delay += Math.round (Math.random () * (task.maxIntervalPeriod - task.minIntervalPeriod));
				}
			}

			task.executeTimeout = setTimeout (function () {
				task.execute ();
			}, delay);
		}
	}
};

// stopRepeat - Cancel any repeating execution that might be configured
RepeatTask.prototype.stopRepeat = function () {
	this.isRepeating = false;
	if (this.executeTimeout != null) {
		clearTimeout (this.executeTimeout);
		this.executeTimeout = null;
	}
};

// suspendRepeat - Halt any future repeat executions until setNextRepeat is invoked
RepeatTask.prototype.suspendRepeat = function () {
	this.isSuspended = true;
	if (this.executeTimeout != null) {
		clearTimeout (this.executeTimeout);
		this.executeTimeout = null;
	}
};

// setNextRepeat - Set the task's next repeat execution to occur after the specified millisecond period elapses
RepeatTask.prototype.setNextRepeat = function (msElapsed) {
	var task;

	task = this;
	if (! task.isRepeating) {
		return;
	}

	task.isSuspended = false;
	if (task.isExecuting) {
		task.nextRepeatPeriod = msElapsed;
		return;
	}

	if (task.executeTimeout != null) {
		clearTimeout (task.executeTimeout);
	}
	task.executeTimeout = setTimeout (function () {
		task.execute ();
	}, msElapsed);
};
