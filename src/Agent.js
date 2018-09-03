// Class that holds data fields regarding a remote system agent

var App = global.App || { };

function Agent () {
	// Additional fields may be populated in this object if they appear in the SystemInterface AgentStatus object
	this.name = "";
	this.version = "";
	this.urlHostname = "";
	this.udpPort = 0;
	this.tcpPort = 0;
	this.runCount = 0;
	this.maxRunCount = 0;

	this.lastStatusCommand = { };
	this.lastStatusCommandTime = 0;
}

Agent.prototype.toString = function () {
	return ("<Agent name=" + this.name + " urlHostname=" + this.urlHostname + " version=" + this.version + " runCount=" + this.runCount + "/" + this.maxRunCount + ">");
};

module.exports = Agent;
