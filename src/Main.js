// Main execution method

"use strict";

var App = require ("./App");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var FsUtil = require (App.SOURCE_DIRECTORY + "/FsUtil");
var SystemAgent = require (App.SOURCE_DIRECTORY + "/SystemAgent");
var SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");

process.setMaxListeners (0);

let conf, fields, skiploglevel;

// Parameter fields for use in reading the systemagent configuration
let configParams = [
	{
		name: "LogLevel",
		type: "string",
		flags: SystemInterface.ParamFlag.Required,
		description: "The log level that should be written by the server",
		defaultValue: "ERR"
	},
	{
		name: "UdpPort",
		type: "number",
		flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.RangedNumber,
		rangeMin: 0,
		rangeMax: 65535,
		description: "The UDP port to use for receiving network commands. A zero value indicates that a port should be chosen at random.",
		defaultValue: 0
	},
	{
		name: "TcpPort",
		type: "number",
		flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.RangedNumber,
		rangeMin: 0,
		rangeMax: 65535,
		description: "The TCP port to use for receiving network commands. A zero value indicates that a port should be chosen at random.",
		defaultValue: 0
	},
	{
		name: "Hostname",
		type: "string",
		flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.Hostname,
		description: "The hostname that should be associated with the systemagent instance. If empty, the system hostname is used.",
		defaultValue: ""
	},
	{
		name: "AgentEnabled",
		type: "boolean",
		flags: SystemInterface.ParamFlag.Required,
		description: "A boolean value indicating if the agent should be enabled by default",
		defaultValue: true
	},
	{
		name: "AgentDisplayName",
		type: "string",
		flags: SystemInterface.ParamFlag.Required,
		description: "The descriptive name that should be associated with the systemagent instance. If empty, the system hostname is used.",
		defaultValue: ""
	},
	{
		name: "ApplicationName",
		type: "string",
		flags: SystemInterface.ParamFlag.Required,
		description: "The name of the application bundle that was used to install the systemagent instance",
		defaultValue: "Membrane Server"
	},
	{
		name: "PublishStatusPeriod",
		type: "number",
		flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.ZeroOrGreater,
		description: "The interval to use for periodic status publish operations, in seconds",
		defaultValue: 60
	},
	{
		name: "MaxTaskCount",
		type: "number",
		flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.ZeroOrGreater,
		description: "The maximum count of simultaneous tasks the agent should run",
		defaultValue: 4
	},
	{
		name: "LinkServerUrl",
		type: "string",
		flags: SystemInterface.ParamFlag.Url,
		description: "The URL that should be used to contact the link server, or an empty string to attempt discovery using network broadcasts",
		defaultValue: ""
	},
	{
		name: "FfmpegPath",
		type: "string",
		flags: SystemInterface.ParamFlag.Required,
		description: "The path for the ffmpeg executable. An empty value specifies that the agent's included ffmpeg binary should be used.",
		defaultValue: ""
	},
	{
		name: "CurlPath",
		type: "string",
		flags: SystemInterface.ParamFlag.Required,
		description: "The path for the curl executable. An empty value specifies that the agent's included curl binary should be used.",
		defaultValue: ""
	}
];

skiploglevel = false;
if (typeof process.env.LOG_LEVEL == "string") {
	if (Log.setLevelByName (process.env.LOG_LEVEL)) {
		skiploglevel = true;
	}
}
if (typeof process.env.LOG_CONSOLE == "string") {
	Log.setConsoleOutput (true);
}
if (typeof process.env.DATA_DIRECTORY == "string") {
	App.DATA_DIRECTORY = process.env.DATA_DIRECTORY;
}
if (typeof process.env.BIN_DIRECTORY == "string") {
	App.BIN_DIRECTORY = process.env.BIN_DIRECTORY;
}
if (typeof process.env.CONF_DIRECTORY == "string") {
	App.CONF_DIRECTORY = process.env.CONF_DIRECTORY;
}

fields = null;
conf = FsUtil.readConfigKeyFile (App.CONFIG_FILE);
if (conf != null) {
	fields = SystemInterface.parseCommand (conf, configParams);
	if (SystemInterface.isError (fields)) {
		console.log ("Error in configuration file " + App.CONFIG_FILE + ": " + fields);
		process.exit (1);
	}

	if (! skiploglevel) {
		if (! Log.setLevelByName (fields.LogLevel)) {
			console.log (`Error in configuration file ${App.CONFIG_FILE}: Invalid log level ${fields.LogLevel}, must be one of: ERROR, WARN, NOTICE, INFO, DEBUG, DEBUG1, DEBUG2, DEBUG3, DEBUG4`);
			process.exit (1);
		}
	}

	if (fields.LogLevel == "DEBUG4") {
		App.ENABLE_VERBOSE_LOGGING = true;
	}

	if (fields.Hostname != "") {
		App.URL_HOSTNAME = fields.Hostname;
	}
	if (fields.AgentDisplayName != "") {
		App.AGENT_DISPLAY_NAME = fields.AgentDisplayName;
	}
	App.AGENT_APPLICATION_NAME = fields.ApplicationName;
	App.AGENT_ENABLED = fields.AgentEnabled;
	App.UDP_PORT = fields.UdpPort;
	App.TCP_PORT = fields.TcpPort;
	App.MAX_TASK_COUNT = fields.MaxTaskCount;
	App.PUBLISH_STATUS_PERIOD = fields.PublishStatusPeriod;
	App.LINK_SERVER_URL = fields.LinkServerUrl;
	App.FFMPEG_PATH = fields.FfmpegPath;
	App.CURL_PATH = fields.CurlPath;
}

Log.write (Log.NOTICE, `Starting operation; version=${App.VERSION} systemInterfaceVersion=${SystemInterface.Version} platform=${process.platform} nodeVersion=${process.version} workingDirectory=${process.cwd ()} dataDirectory=${App.DATA_DIRECTORY} config=${JSON.stringify (fields)}`);

App.systemAgent = new SystemAgent ();
App.systemAgent.start (startComplete);
function startComplete (err) {
	if (err != null) {
		Log.write (Log.ERR, `Failed to start agent - ${err}`);
		process.exit (1);
	}

	Log.write (Log.INFO, `Agent start complete; agentId=${App.systemAgent.agentId} urlHostname=${App.systemAgent.urlHostname}`);
}

// Process event handlers
process.on ("SIGINT", () => {
	Log.write (Log.NOTICE, "Caught SIGINT, exit");
	doExit ();
});

process.on ("SIGTERM", () => {
	Log.write (Log.NOTICE, "Caught SIGTERM, exit");
	doExit ();
});

function doExit () {
	App.systemAgent.stopAllServers (function () {
		process.exit (0);
	});
}

process.on ("uncaughtException", (e) => {
	Log.write (Log.ERR, `Uncaught exception: ${e.toString ()}\nStack: ${e.stack}`);
});
