// Class that runs servers and receives remote commands on their behalf

"use strict";

var App = global.App || { };
var Os = require ("os");
var Fs = require ("fs");
var Http = require ("http");
var Dgram = require ("dgram");
var Url = require ("url");
var QueryString = require ("querystring");
var UuidV4 = require ("uuid/v4");
var Async = require ("async");
var IoClient = require ("socket.io-client");
var Log = require (App.SOURCE_DIRECTORY + "/Log");
var Result = require (App.SOURCE_DIRECTORY + "/Result");
var FsUtil = require (App.SOURCE_DIRECTORY + "/FsUtil");
var Ipv4Address = require (App.SOURCE_DIRECTORY + "/Ipv4Address");
var Task = require (App.SOURCE_DIRECTORY + "/Task/Task");
var RepeatTask = require (App.SOURCE_DIRECTORY + "/RepeatTask");
var SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");
var AgentProcess = require (App.SOURCE_DIRECTORY + "/AgentProcess");
var Server = require (App.SOURCE_DIRECTORY + "/Server/Server");

const LINK_SERVER_BROADCAST_PERIOD = 22; // seconds

class SystemAgent {
	constructor () {
		this.isStarted = false;
		this.isEnabled = true;
		this.dataPath = App.DATA_DIRECTORY + "/systemagent";
		this.runStatePath = this.dataPath + "/state";
		this.agentId = "";

		this.displayName = "";
		this.applicationName = "";
		this.urlHostname = "";
		this.agentLinkUrl = "";
		this.platform = "";

		// TODO: Possibly set a different user ID value for use in command invocations
		this.commandUserId = "systemagent";

		this.isStarted = false;
		this.startTime = 0;
		this.httpServer = null;
		this.httpServerPort = 0;

		this.isBroadcastReady = false;
		this.datagramSocket = null;
		this.datagramSocketPort = 0;
		this.updateDatagramSocketTask = new RepeatTask ();

		// A map of interface names to broadcast addresses for use by the datagram socket
		this.datagramBroadcastAddressMap = { };

		// A map of paths to functions for handling requests received by the HTTP server
		this.requestHandlerMap = { };

		// A map of paths to functions for handling invoke requests received by the HTTP server
		this.invokeRequestHandlerMap = { };

		// A map of command type values to functions for handling received linkClient calls
		this.linkCommandTypeMap = { };

		// A list of Server objects
		this.serverList = [ ];

		// A map of configuration values persisted as local state in the agent's data path
		this.runState = { };

		// A map of task ID values to Task objects
		this.taskMap = { };

		// A map of task ID values to cached TaskItem objects, used to publish event record updates
		this.taskRecordMap = { };

		this.maxRunCount = App.MAX_TASK_COUNT;
		this.taskExpireTime = 900; // seconds
		this.updateTaskMapTask = new RepeatTask ();

		this.isConnectingLinkClient = false;
		this.isLinkClientConnected = false;
		this.linkClient = null;
		this.linkClientUrl = null;

		this.updateLinkClientTask = new RepeatTask ();
		this.sendLinkServerBroadcastTask = new RepeatTask ();
		this.publishStatusEventTask = new RepeatTask ();
		this.linkClientConnectCallbacks = [ ];
		this.linkClientDisconnectCallbacks = [ ];
	}

	// Start the agent's operation and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred)
	start (startCallback) {
		var agent, serverindex, pos, i, server, serverconfigs, c;

		agent = this;
		if (agent.isStarted) {
			process.nextTick (function () {
				startCallback (null);
			});
			return;
		}

		agent.isEnabled = App.AGENT_ENABLED;
		agent.applicationName = App.AGENT_APPLICATION_NAME;

		if (App.AGENT_DISPLAY_NAME != null) {
			agent.displayName = App.AGENT_DISPLAY_NAME;
		}
		else {
			agent.displayName = Os.hostname ();
			pos = agent.displayName.indexOf (".");
			if (pos > 0) {
				agent.displayName = agent.displayName.substring (0, pos);
			}
		}

		if (process.platform == "win32") {
			// TODO: Possibly set agent.platform to "win64"
			agent.platform = "win32";
		}
		else if (process.platform == "darwin") {
			agent.platform = "macos";
		}
		else if (process.platform == "linux") {
			agent.platform = "linux";
		}

		serverconfigs = FsUtil.readConfigFile ("conf/server.conf");
		if (serverconfigs == null) {
			serverconfigs = [ ];
		}
		if (serverconfigs.length <= 0) {
			process.nextTick (function () {
				startCallback ("No server types configured");
			});
			return;
		}

		for (i = 0; i < serverconfigs.length; ++i) {
			c = serverconfigs[i];
			if (Server.ServerTypes[c.type] == null) {
				process.nextTick (function () {
					startCallback ("Unknown server type \"" + c.type + "\"");
				});
				return;
			}

			server = new Server.ServerTypes[c.type] ();
			server.baseConfiguration = c.params;
			agent.serverList.push (server);
		}

		agent.startTime = new Date ().getTime ();
		FsUtil.createDirectory (agent.dataPath, createDirectoryComplete);
		function createDirectoryComplete (err) {
			if (err != null) {
				startCallback (err);
				return;
			}
			FsUtil.readStateFile (agent.runStatePath, readStateComplete);
		}

		function readStateComplete (err, stateData) {
			if ((err != null) || (stateData == null)) {
				agent.agentId = UuidV4 ();
				agent.runState.agentId = agent.agentId;
				FsUtil.writeStateFile (agent.runStatePath, agent.runState, writeStateComplete);
				return;
			}

			agent.runState = stateData;
			Log.write (Log.DEBUG, "Read agent state; path=\"" + agent.runStatePath + "\" state=" + JSON.stringify (agent.runState));
			if (typeof agent.runState.agentId != "string") {
				agent.agentId = UuidV4 ();
				agent.runState.agentId = agent.agentId;
				FsUtil.writeStateFile (agent.runStatePath, agent.runState, writeStateComplete);
				return;
			}

			agent.agentId = agent.runState.agentId;
			if (agent.runState.agentConfiguration != null) {
				if (typeof agent.runState.agentConfiguration.isEnabled == "boolean") {
					agent.isEnabled = agent.runState.agentConfiguration.isEnabled;
				}
				if ((typeof agent.runState.agentConfiguration.displayName == "string") && (agent.runState.agentConfiguration.displayName != "")) {
					agent.displayName = agent.runState.agentConfiguration.displayName;
				}
			}
			writeStateComplete (null);
		}

		function writeStateComplete (err) {
			if (err != null) {
				Log.write (Log.WARNING, "Failed to write agent state; path=\"" + agent.runStatePath + "\" err=" + err);
			}

			startHttpServer ();
		}

		function startHttpServer () {
			agent.httpServer = Http.createServer (function (request, response) {
				agent.handleRequest (request, response);
			});

			agent.httpServer.on ("error", function (err) {
				Log.write (Log.ERR, "HTTP server error: " + err);
				if (! agent.isStarted) {
					startCallback (err);
				}
			});

			agent.httpServer.listen (App.TCP_PORT, null, 1024, httpServerListenComplete);
		}

		function httpServerListenComplete (err) {
			var address;

			if (err != null) {
				startCallback (err);
				return;
			}

			address = agent.httpServer.address ();
			if (typeof address.port != "number") {
				startCallback ("Internal error: failed to read listen port from HTTP server");
				return;
			}

			agent.httpServerPort = address.port;
			agent.resetUrlHostname ();
			Log.write (Log.INFO, "HTTP server listening; address=" + agent.urlHostname + ":" + agent.httpServerPort);

			if (! agent.isEnabled) {
				startServersComplete ();
				return;
			}

			agent.startAllServers (startServersComplete);
		}

		function startServersComplete () {
			agent.addInvokeRequestHandler ("/", SystemInterface.Constant.DefaultCommandType, function (cmdInv) {
				switch (cmdInv.command) {
					case SystemInterface.CommandId.GetStatus: {
						return (agent.getStatus ());
					}
					case SystemInterface.CommandId.AgentStatus: {
						if (agent.isConnectingLinkClient && (agent.linkClientUrl == null)) {
							if (cmdInv.params.linkServerStatus != null) {
								agent.linkClientUrl = cmdInv.params.linkServerStatus.linkUrl;
								Log.write (Log.DEBUG, "Found link server; url=\"" + agent.linkClientUrl + "\"");
								agent.sendLinkServerBroadcastTask.stopRepeat ();
							}
						}

						return (SystemInterface.createCommand (agent.getCommandPrefix (), "CommandResult", SystemInterface.Constant.DefaultCommandType, {
							success: true
						}));
					}
					case SystemInterface.CommandId.GetAgentConfiguration: {
						return (agent.getConfiguration ());
					}
					case SystemInterface.CommandId.UpdateAgentConfiguration: {
						let err, c;

						Log.write (Log.INFO, "Update agent configuration; cmdInv=" + JSON.stringify (cmdInv));
						err = false;
						for (let server of agent.serverList) {
							c = cmdInv.params.agentConfiguration[server.getAgentConfigurationKey ()];
							if ((typeof c == "object") && (c != null)) {
								if (! server.isConfigurationValid (c)) {
									err = true;
									break;
								}
							}
						}
						if (err) {
							return (SystemInterface.createCommand (agent.getCommandPrefix (), "CommandResult", SystemInterface.Constant.DefaultCommandType, {
								success: false,
								error: "Invalid configuration parameters"
							}));
						}

						if ((typeof agent.runState.agentConfiguration != "object") || (agent.runState.agentConfiguration == null)) {
							agent.runState.agentConfiguration = { };
						}
						for (let server of agent.serverList) {
							c = cmdInv.params.agentConfiguration[server.getAgentConfigurationKey ()];
							if ((typeof c == "object") && (c != null)) {
								server.configure (c);
								agent.runState.agentConfiguration[server.getAgentConfigurationKey ()] = c;
							}
						}

						agent.displayName = cmdInv.params.agentConfiguration.displayName;
						agent.runState.agentConfiguration.displayName = agent.displayName;

						if ((typeof cmdInv.params.agentConfiguration.isEnabled == "boolean") && (cmdInv.params.agentConfiguration.isEnabled != agent.isEnabled)) {
							agent.isEnabled = cmdInv.params.agentConfiguration.isEnabled;
							agent.runState.agentConfiguration.isEnabled = agent.isEnabled;

							if (agent.isEnabled) {
								agent.startAllServers (() => { });
							}
							else {
								agent.stopAllServers (() => { });
							}
						}

						FsUtil.writeStateFile (agent.runStatePath, agent.runState, function (err) {
							if (err != null) {
								Log.write (Log.ERR, `Failed to write run state; path=${agent.runStatePath} err=${err}`);
							}
						});
						return (agent.getConfiguration ());
					}
					case SystemInterface.CommandId.ShutdownAgent: {
						Log.write (Log.NOTICE, "Shutdown agent by remote command");

						agent.stopAllServers (() => {
							process.exit (0);
						});
						return (SystemInterface.createCommand (agent.getCommandPrefix (), "CommandResult", SystemInterface.Constant.DefaultCommandType, {
							success: true
						}));
					}
					case SystemInterface.CommandId.StartServers: {
						Log.write (Log.NOTICE, "Start all servers by remote command");
						agent.startAllServers (() => { });
						return (SystemInterface.createCommand (agent.getCommandPrefix (), "CommandResult", SystemInterface.Constant.DefaultCommandType, {
							success: true
						}));
					}
					case SystemInterface.CommandId.StopServers: {
						Log.write (Log.NOTICE, "Stop all servers by remote command");
						agent.stopAllServers (() => { });
						return (SystemInterface.createCommand (agent.getCommandPrefix (), "CommandResult", SystemInterface.Constant.DefaultCommandType, {
							success: true
						}));
					}
					case SystemInterface.CommandId.CancelTask: {
						agent.cancelTask (cmdInv);
						return (SystemInterface.createCommand (agent.getCommandPrefix (), "CommandResult", SystemInterface.Constant.DefaultCommandType, {
							success: true
						}));
					}
				}

				return (null);
			});

			agent.updateDatagramSocketTask.setRepeating (function (callback) {
				agent.updateDatagramSocket (callback);
			}, App.HEARTBEAT_PERIOD * 8, App.HEARTBEAT_PERIOD * 16);

			agent.updateTaskMapTask.setRepeating (function (callback) {
				agent.updateTaskMap (callback);
			}, App.HEARTBEAT_PERIOD, App.HEARTBEAT_PERIOD * 2);
			agent.isStarted = true;
			startCallback (null);
		}
	}

	// Start all servers and invoke the provided callback when complete
	startAllServers (startCallback) {
		let startServer, state;

		if (! this.isEnabled) {
			process.nextTick (() => {
				startCallback (`Agent is not enabled for operation`);
			});
			return;
		}

		for (let server of this.serverList) {
			if (server.isRunning) {
				process.nextTick (() => {
					startCallback (`${server.name} is already running`);
				});
				return;
			}
		}

		state = { };
		if ((typeof this.runState.agentConfiguration == "object") && (this.runState.agentConfiguration != null)) {
			state = SystemInterface.parseTypeObject ("AgentConfiguration", this.runState.agentConfiguration);
			if (SystemInterface.isError (state)) {
				Log.write (Log.ERR, `Failed to parse stored server configuration; err${state}`);
				state = { };
			}
		}
		for (let server of this.serverList) {
			server.configure (state[server.getAgentConfigurationKey ()]);
			if (! server.isConfigured) {
				process.nextTick (() => {
					startCallback (`${server.name} is not configured`);
				});
				return;
			}
		}

		startServer = (item, callback) => {
			item.start (callback);
		};
		Async.eachSeries (this.serverList, startServer, startCallback);
	}

	// Stop all servers and invoke the provided callback when complete
	stopAllServers (callback) {
		var agent, serverindex;

		agent = this;
		serverindex = 0;
		stopNextServer ();

		function stopNextServer () {
			if (serverindex >= agent.serverList.length) {
				callback ();
				return;
			}

			agent.serverList[serverindex].stop (stopComplete);
		}

		function stopComplete () {
			++serverindex;
			stopNextServer ();
		}
	}

	// Reset the urlHostname value as appropriate for configured values and detected interfaces
	resetUrlHostname () {
		let interfaces, addresses, ip, urlhostname;

		if (App.URL_HOSTNAME != null) {
			this.urlHostname = App.URL_HOSTNAME;
			return;
		}

		urlhostname = "";
		interfaces = Os.networkInterfaces ();
		for (let i in interfaces) {
			addresses = interfaces[i];
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG4, "Found network interface; name=" + i + " addressCount=" + addresses.length + " interfaceCount=" + Object.keys (interfaces).length);
			}
			for (let addr of addresses) {
				if (App.ENABLE_VERBOSE_LOGGING) {
					Log.write (Log.DEBUG4, "Found network address; name=" + i + " address=" + addr.address + " netmask=" + addr.netmask + " family=" + addr.family + " mac=" + addr.mac + " internal=" + addr.internal);
				}
				if (addr.internal) {
					continue;
				}
				if (addr.family != "IPv4") {
					// TODO: Possibly support IPv6 interface addresses
					continue;
				}

				ip = new Ipv4Address (addr.address);
				if (ip.isValid) {
					urlhostname = addr.address;
					break;
				}
			}

			if (urlhostname != "") {
				break;
			}
		}

		if (urlhostname != "") {
			this.urlHostname = urlhostname;
		}
		else {
			this.urlHostname = Os.hostname ();
		}
	}

	// Handle an HTTP request received by the server
	handleRequest (request, response) {
		var agent, path, url, address, body, q;

		agent = this;
		address = request.socket.remoteAddress + ":" + request.socket.remotePort;
		path = null;
		url = Url.parse (request.url);
		if (url != null) {
			path = url.pathname;
		}

		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG3, "HTTP client request begin; address=\"" + address + "\" method=" + request.method + " path=\"" + path + "\"");
		}

		if (path == null) {
			Log.write (Log.DEBUG2, "HTTP client \"" + address + "\" 404/Not found, no path");
			agent.endRequest (request, response, 404, "Not found");
			return;
		}

		if (request.method == "GET") {
			q = QueryString.parse (url.query);
			if (typeof q.json == "string") {
				execute (q.json);
			}
			else {
				execute (q);
			}
		}
		else if (request.method == "POST") {
			body = [ ];
			request.on ("data", function (chunk) {
				if (App.ENABLE_VERBOSE_LOGGING) {
					Log.write (Log.DEBUG4, "HTTP client body data; address=\"" + address + "\" method=" + request.method + " path=\"" + path + "\" bodyLength=" + body.length);
				}

				body.push (chunk);
			});
			request.on ("end", function () {
				body = Buffer.concat (body).toString ();
				if (App.ENABLE_VERBOSE_LOGGING) {
					Log.write (Log.DEBUG4, "HTTP client body end; address=\"" + address + "\" method=" + request.method + " path=\"" + path + "\" bodyLength=" + body.length);
				}

				execute (body);
			});
		}
		else {
			agent.endRequest (request, response, 405, "Method not allowed");
		}

		function execute (body) {
			var cmdinv, fn, responsedata, buffer;

			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG4, "HTTP client request execute; address=\"" + address + "\" method=" + request.method + " path=\"" + path + "\" body=" + JSON.stringify (body));
			}

			cmdinv = SystemInterface.parseCommand (body);
			if (SystemInterface.isError (cmdinv)) {
				Log.write (Log.DEBUG2, "HTTP client request parse error; address=\"" + address + "\" method=" + request.method + " path=\"" + path + "\" body=" + JSON.stringify (body) + " err=\"" + cmdinv + "\"");
				agent.endRequest (request, response, 400, "Bad request");
				return;
			}

			fn = agent.invokeRequestHandlerMap[cmdinv.commandType + ":" + path];
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG4, "HTTP client request find invoke handler; address=\"" + address + "\" method=" + request.method + " path=\"" + path + "\" body=" + JSON.stringify (body) + " fn=" + ((fn != null) ? "true" : "false") + " commandType=" + cmdinv.commandType);
			}
			if (fn != null) {
				responsedata = fn (cmdinv);
				if (responsedata == null) {
					Log.write (Log.DEBUG2, "HTTP client \"" + address + "\" path \"" + path + "\" 200/OK, empty response data");
					agent.endRequest (request, response, 200, "");
					return;
				}

				if (typeof responsedata != "object") {
					Log.write (Log.DEBUG2, "HTTP client \"" + address + "\" path \"" + path + "\" 500/Internal server error, invalid responsedata object " + JSON.stringify (responsedata));
					agent.endRequest (request, response, 500, "Internal server error");
					return;
				}

				buffer = Buffer.from (JSON.stringify (responsedata), "UTF-8");
				Log.write (Log.DEBUG2, `HTTP request complete; response=200/OK client=${address} path=${path} responseLength=${buffer.length} command=${cmdinv.commandName} responseCommand=${responsedata.commandName}`);
				agent.endRequest (request, response, 200, buffer);
				return;
			}

			fn = agent.requestHandlerMap[path];
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG4, "HTTP client request find path handler; address=\"" + address + "\" method=" + request.method + " path=\"" + path + "\" body=" + JSON.stringify (body) + " fn=" + ((fn != null) ? "true" : "false"));
			}
			if (fn != null) {
				fn (cmdinv, request, response);
				return;
			}
			Log.write (Log.DEBUG2, "HTTP client \"" + address + "\" 404/Not found, path \"" + path + "\" not found");
			agent.endRequest (request, response, 404, "Not found");
		}
	}

	// End an HTTP request
	endRequest (request, response, code, data) {
		response.statusCode = code;
		response.setHeader ("Access-Control-Allow-Origin", "*");
		response.setHeader ("Content-Length", data.length);
		if (data.length > 0) {
			response.write (data);
		}
		response.end ();
	}

	// Set a request handler for the specified path. If a request with this path is received, the handler function is invoked with "request" and "response" objects.
	addRequestHandler (path, handler) {
		this.requestHandlerMap[path] = handler;
	}

	// Set an invocation handler for the specified path and command type. If a matching request is received, the handler function is invoked with a "cmdInv" parameter (a SystemInterface command invocation object). The handler function is expected to return a command invocation object to be included in a response to the caller, or null if no such invocation is needed.
	addInvokeRequestHandler (path, commandType, handler) {
		this.invokeRequestHandlerMap[commandType + ":" + path] = handler;
	}

	// Set a call handler for the specified command type. If an event command with this type is received, the handler function is invoked with the "cmdInv" object.
	addLinkCommandHandler (commandType, handler) {
		this.linkCommandTypeMap[commandType] = handler;
	}

	// Enable the agent's linkClient object, causing it to maintain contact to available LinkServer agents. If connectCallback and disconnectCallback are provided, they are invoked when the linkClient connect becomes available or unavailable.
	connectLinkClient (connectCallback, disconnectCallback) {
		var agent;

		agent = this;
		if (typeof connectCallback == "function") {
			agent.linkClientConnectCallbacks.push (connectCallback);
		}
		if (typeof disconnectCallback == "function") {
			agent.linkClientDisconnectCallbacks.push (disconnectCallback);
		}
		if (agent.isConnectingLinkClient) {
			return;
		}

		agent.isConnectingLinkClient = true;
		if ((agent.linkClientUrl == null) && (App.LINK_SERVER_URL != "")) {
			agent.linkClientUrl = App.LINK_SERVER_URL;
		}
		Log.write (Log.DEBUG, "Link server connections enabled; linkClientUrl=\"" + agent.linkClientUrl + "\"");
		agent.updateLinkClientTask.setRepeating (function (callback) {
			agent.updateLinkClient (callback);
		}, App.HEARTBEAT_PERIOD, App.HEARTBEAT_PERIOD * 2);
		agent.updateLinkClientTask.setNextRepeat (App.HEARTBEAT_PERIOD);
	}

	// Copy fields from the provided object into the agent's run state and execute a write operation to persist the change
	updateRunState (fields) {
		for (let i in fields) {
			this.runState[i] = fields[i];
		}

		FsUtil.writeStateFile (this.runStatePath, this.runState, () => { });
	}

	// Publish an event to the active linkClient. Returns a Result value.
	publishEvent (cmdInv) {
		if ((! this.isLinkClientConnected) || (this.linkClient == null)) {
			Log.write (Log.DEBUG, "Failed to publish event; err=\"Not connected\"");
			return (Result.ERROR_NOT_CONNECTED);
		}

		cmdInv = SystemInterface.parseCommand (cmdInv);
		if (SystemInterface.isError (cmdInv)) {
			Log.write (Log.DEBUG, "Failed to publish event; err=" + cmdInv);
			return (Result.ERROR_INVALID_PARAMS);
		}

		this.linkClient.emit (SystemInterface.Constant.WebSocketEvent, cmdInv);
		return (Result.SUCCESS);
	}

	// Publish a WriteEvents command containing the provided item or array of items to the active linkClient. Returns a Result value.
	publishWriteEvents (items) {
		let cmd;

		if ((! this.isLinkClientConnected) || (this.linkClient == null)) {
			Log.write (Log.DEBUG, "Failed to write events; err=\"Not connected\"");
			return (Result.ERROR_NOT_CONNECTED);
		}

		if (! Array.isArray (items)) {
			items = [ items ];
		}
		cmd = SystemInterface.createCommand (this.getCommandPrefix (), "WriteEvents", SystemInterface.Constant.Link, {
			items: items
		});
		if (SystemInterface.isError (cmd)) {
			Log.write (Log.ERR, "Failed to create WriteEvents command: " + cmd);
			return (Result.ERROR_INVALID_PARAMS);
		}

		this.linkClient.emit (SystemInterface.Constant.WebSocketEvent, cmd);
		return (Result.SUCCESS);
	}

	// Execute actions needed to maintain the datagram socket and invoke the provided callback when complete
	updateDatagramSocket (callback) {
		var agent, addrmap, interfaces, i, addresses, j, addr, item, ip, ischanged;

		agent = this;

		addrmap = { };
		interfaces = Os.networkInterfaces ();
		for (i in interfaces) {
			addresses = interfaces[i];
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG4, "Found network interface; name=" + i + " addressCount=" + addresses.length + " interfaceCount=" + Object.keys (interfaces).length);
			}
			for (j = 0; j < addresses.length; ++j) {
				addr = addresses[j];
				if (App.ENABLE_VERBOSE_LOGGING) {
					Log.write (Log.DEBUG4, "Found network address; name=" + i + " address=" + addr.address + " netmask=" + addr.netmask + " family=" + addr.family + " mac=" + addr.mac + " internal=" + addr.internal);
				}
				if (addr.internal) {
					continue;
				}
				if (addr.family != "IPv4") {
					// TODO: Possibly support IPv6 interface addresses
					continue;
				}

				ip = new Ipv4Address (addr.address);
				ip.setNetmask (addr.netmask);
				addrmap[i] = ip.getBroadcastAddress ();
				break;
			}
		}

		if (Object.keys (addrmap).length <= 0) {
			if (Object.keys (agent.datagramBroadcastAddressMap).length > 0) {
				agent.datagramBroadcastAddressMap = { };
			}
			if (agent.datagramSocket != null) {
				Log.write (Log.DEBUG3, "Close datagram socket (no broadcast addresses available)");
				agent.isBroadcastReady = false;
				agent.datagramSocket.close ();
				agent.datagramSocket = null;
			}
		}
		else {
			ischanged = false;
			if (Object.keys (addrmap).length != Object.keys (agent.datagramBroadcastAddressMap).length) {
				ischanged = true;
			}
			else {
				for (i in addrmap) {
					if (addrmap[i] != agent.datagramBroadcastAddressMap[i]) {
						ischanged = true;
						break;
					}
				}
			}

			if (ischanged) {
				if (agent.datagramSocket != null) {
					Log.write (Log.DEBUG3, "Close datagram socket (broadcast addresses changed)");
					agent.isBroadcastReady = false;
					agent.datagramSocket.close ();
					agent.datagramSocket = null;
				}
				agent.datagramBroadcastAddressMap = addrmap;
			}

			if (agent.datagramSocket == null) {
				agent.datagramSocket = createSocket ();
				function createSocket () {
					var socket;

					socket = Dgram.createSocket ("udp4");
					socket.on ("error", function (err) {
						Log.write (Log.ERR, "Datagram socket error; err=" + err);
						socket.close ();
						agent.isBroadcastReady = false;
						agent.datagramSocket = null;
					});
					socket.on ("listening", function () {
						var address, port;

						try {
							socket.setBroadcast (true);
						}
						catch (e) {
							agent.isBroadcastReady = false;
							agent.datagramSocket = null;
							Log.write (Log.WARNING, "Failed to enable broadcast socket, network functions may be unavailable; err=" + err);
							return;
						}
						address = socket.address ();
						if (address != null) {
							port = address.port;
						}
						if (typeof port != "number") {
							agent.isBroadcastReady = false;
							agent.datagramSocket = null;
							Log.write (Log.WARNING, "Failed to read port from datagram socket, network functions may be unavailable");
							return;
						}
						Log.write (Log.DEBUG, "Datagram socket listening; port=" + port);
						agent.datagramSocketPort = port;
						agent.isBroadcastReady = true;
					});
					socket.on ("message", function (msg, rinfo) {
						agent.handleDatagramMessage (msg);
					});

					socket.bind (App.UDP_PORT);
					return (socket);
				}
			}
		}

		process.nextTick (callback);
	}

	// Execute actions appropriate for a received datagram message
	handleDatagramMessage (msg) {
		var agent, cmd;

		agent = this;
		cmd = SystemInterface.parseCommand (msg.toString ());
		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, "Datagram message received; len=" + msg.length + " msg=" + msg + " cmd=" + JSON.stringify (cmd));
		}
		if (SystemInterface.isError (cmd)) {
			Log.write (Log.DEBUG, "Discard datagram message; err=\"" + cmd + "\"");
			return;
		}

		switch (cmd.command) {
			case SystemInterface.CommandId.ReportStatus: {
				var statuscmd, desturl, url;

				desturl = cmd.params.destination;
				url = Url.parse (cmd.params.destination);
				if (url == null) {
					break;
				}

				Log.write (Log.DEBUG3, "ReportStatus received; destination=\"" + desturl + "\" reportCommandType=" + cmd.params.reportCommandType + " protocol=" + url.protocol + " hostname=" + url.hostname + " port=" + url.port);
				if (url.protocol.match (/^udp(:){0,1}/)) {
					statuscmd = agent.getStatus ();
					if (statuscmd != null) {
						statuscmd.commandType = cmd.params.reportCommandType;
						statuscmd = Buffer.from (JSON.stringify (statuscmd));
						agent.datagramSocket.send (statuscmd, 0, statuscmd.length, url.port, url.hostname);
					}
				}
				else if (url.protocol.match (/^http(:){0,1}/)) {
					statuscmd = agent.getStatus ();
					if (statuscmd != null) {
						statuscmd.commandType = cmd.params.reportCommandType;
						statuscmd = JSON.stringify (statuscmd);
						agent.sendHttpPost (desturl, statuscmd);
					}
				}
				else {
					Log.write (Log.DEBUG, "ReportStatus discarded; err=Unknown destination protocol \"" + url.protocol + "\"");
				}
				break;
			}
			case SystemInterface.CommandId.ReportContact: {
				var contactcmd, desturl, url;

				desturl = cmd.params.destination;
				url = Url.parse (cmd.params.destination);
				if (url == null) {
					break;
				}

				Log.write (Log.DEBUG3, "ReportContact received; destination=\"" + desturl + "\" reportCommandType=" + cmd.params.reportCommandType + " protocol=" + url.protocol + " hostname=" + url.hostname + " port=" + url.port);
				if (url.protocol.match (/^udp(:){0,1}/)) {
					contactcmd = agent.getContact ();
					if (contactcmd != null) {
						contactcmd.commandType = cmd.params.reportCommandType;
						contactcmd = Buffer.from (JSON.stringify (contactcmd));
						agent.datagramSocket.send (contactcmd, 0, contactcmd.length, url.port, url.hostname);
					}
				}
				else if (url.protocol.match (/^http(:){0,1}/)) {
					contactcmd = agent.getContact ();
					if (contactcmd != null) {
						contactcmd.commandType = cmd.params.reportCommandType;
						contactcmd = JSON.stringify (contactcmd);
						agent.sendHttpPost (desturl, contactcmd);
					}
				}
				else {
					Log.write (Log.DEBUG, "ReportContact discarded; err=Unknown destination protocol \"" + url.protocol + "\"");
				}
				break;
			}
			default: {
				break;
			}
		}
	}

	// Execute actions needed to maintain the link client connection and invoke the provided callback when complete
	updateLinkClient (callback) {
		let client, targeturl, linkserver;

		if (! this.isConnectingLinkClient) {
			this.updateLinkClientTask.stopRepeat ();
			process.nextTick (callback);
			return;
		}

		if (this.linkClientUrl == null) {
			linkserver = null;
			for (let server of this.serverList) {
				if (server.name == "LinkServer") {
					linkserver = server;
					break;
				}
			}
			if (linkserver != null) {
				targeturl = linkserver.linkUrl;
				if ((typeof targeturl == "string") && (targeturl != "")) {
					this.linkClientUrl = targeturl;
					Log.write (Log.DEBUG, `Found local link server; url=${this.linkClientUrl}`);
				}
			}
			else {
				if (! this.sendLinkServerBroadcastTask.isRepeating) {
					Log.write (Log.DEBUG, "Link client sending broadcasts to find server");
					this.sendLinkServerBroadcastTask.setRepeating ((callback, task) => {
						let cmd;

						cmd = SystemInterface.createCommand (this.getCommandPrefix (), "ReportStatus", SystemInterface.Constant.DefaultCommandType, {
							destination: "http://" + this.urlHostname + ":" + this.httpServerPort + "/",
							reportCommandType: SystemInterface.Constant.DefaultCommandType
						});
						if (SystemInterface.isError (cmd)) {
							Log.write (Log.ERR, `Failed to create ReportStatus command for LinkServer discovery; err=${cmd}`);
							task.stopRepeat ();
						}
						else {
							this.sendBroadcast (JSON.stringify (cmd));
						}

						process.nextTick (callback);
					}, (LINK_SERVER_BROADCAST_PERIOD * 1000), Math.floor (LINK_SERVER_BROADCAST_PERIOD * 1000 * 1.2));
				}
			}

			process.nextTick (callback);
			return;
		}

		if (this.linkClient == null) {
			Log.write (Log.DEBUG, `Link client created; linkClientUrl=${this.linkClientUrl}`);
			client = new IoClient (this.linkClientUrl, {
				reconnection: false,
				multiplex: false,
				transports: ["websocket"]
			});
			this.linkClient = client;

			client.on ("connect", () => {
				Log.write (Log.DEBUG, `Link client connected; linkClientUrl=${this.linkClientUrl}`);
				this.isLinkClientConnected = true;

				for (let i = 0; i < this.linkClientConnectCallbacks.length; ++i) {
					this.linkClientConnectCallbacks[i] ();
				}

				this.publishStatusEventTask.setRepeating ((callback, task) => {
					let cmd;

					cmd = this.getStatus ();
					if (cmd == null) {
						task.stopRepeat ();
					}
					else {
						SystemInterface.setRecordFields (cmd, this.agentId, new Date ().getTime ());
						this.publishWriteEvents (cmd);
					}
					process.nextTick (callback);
				}, Math.floor (App.PUBLISH_STATUS_PERIOD * 1000 * 0.98), App.PUBLISH_STATUS_PERIOD * 1000);
			});

			client.on ("disconnect", (err) => {
				Log.write (Log.DEBUG, `Link client disconnect; err=${err}`);
				this.isLinkClientConnected = false;
				if (this.linkClient != null) {
					this.linkClient.close ();
					this.linkClient = null;
				}
				this.linkClientUrl = null;

				this.publishStatusEventTask.stopRepeat ();
				for (let i = 0; i < this.linkClientDisconnectCallbacks.length; ++i) {
					this.linkClientDisconnectCallbacks[i] ();
				}
			});

			client.on ("error", (err) => {
				Log.write (Log.DEBUG, `Link client err; err=${err}`);
			});

			client.on (SystemInterface.Constant.WebSocketEvent, (cmdInv) => {
				let fn;

				fn = this.linkCommandTypeMap[cmdInv.commandType];
				if (App.ENABLE_VERBOSE_LOGGING) {
					Log.write (Log.DEBUG4, `Received websocket event; cmdInv=${JSON.stringify (cmdInv)} handlerFound=${(typeof fn == "function")}`);
				}
				if (typeof fn == "function") {
					fn (cmdInv);
				}
			});
		}

		process.nextTick (callback);
	}

	// Send a broadcast message using the provided string or Buffer value. Returns a boolean value indicating if the message was sent.
	sendBroadcast (message) {
		var i, item;

		if (! this.isBroadcastReady) {
			return (false);
		}

		if (typeof message == "string") {
			message = Buffer.from (message);
		}
		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, "Send broadcast message; message=" + message);
		}

		for (i in this.datagramBroadcastAddressMap) {
			item = this.datagramBroadcastAddressMap[i];
			this.datagramSocket.send (message, 0, message.length, SystemInterface.Constant.DefaultUdpPort, item);
		}
		return (true);
	}

	// Send a message using an HTTP POST request and the provided string or Buffer value. Returns a boolean value indicating if the message was sent.
	sendHttpPost (postUrl, message) {
		var url, postdata, req;

		url = postUrl;
		if (typeof url == "string") {
			url = Url.parse (url);
			if (url == null) {
				Log.write (Log.DEBUG, "Failed to send HTTP POST request; err=Invalid URL \"" + postUrl + "\"");
				return;
			}
		}

		postdata = message;
		if (App.ENABLE_VERBOSE_LOGGING) {
			Log.write (Log.DEBUG4, "Send HTTP POST request; postUrl=\"" + postUrl + "\" postdata=" + postdata);
		}
		req = Http.request ({
			hostname: url.hostname,
			port: url.port,
			path: url.path,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Content-Length": postdata.length
			}
		}, requestComplete);
		req.on ("error", requestError);

		function requestComplete (response) {
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG4, "Completed sending HTTP POST request; statusCode=" + response.statusCode + " postUrl=\"" + postUrl + "\" postdata=" + postdata);
			}
		}

		function requestError (err) {
			if (App.ENABLE_VERBOSE_LOGGING) {
				Log.write (Log.DEBUG, "Error sending HTTP POST request; err=" + err + " postUrl=\"" + postUrl + "\" postdata=" + postdata);
			}
		}

		req.write (postdata);
		req.end ();
	}

	// Return an object containing an AgentStatus command that reflects current state, or null if the command could not be created
	getStatus () {
		let cmd, tasks, runcount, task, params;

		if (! this.isBroadcastReady) {
			return (null);
		}

		tasks = [ ];
		runcount = 0;
		for (let i in this.taskMap) {
			task = this.taskMap[i];
			if (task.isRunning) {
				++runcount;
			}
			tasks.push (task.getTaskItem ());
		}

		params = {
			id: this.agentId,
			displayName: this.displayName,
			applicationName: this.applicationName,
			urlHostname: this.urlHostname,
			tcpPort: this.httpServerPort,
			udpPort: this.datagramSocketPort,
			uptime: Log.getDurationString (new Date ().getTime () - this.startTime),
			version: App.VERSION,
			nodeVersion: process.version,
			platform: this.platform,
			isRunning: false,
			tasks: tasks,
			runCount: runcount,
			maxRunCount: this.maxRunCount
		};

		if (this.serverList.length > 0) {
			params.isRunning = true;
			for (let server of this.serverList) {
				server.setStatus (params);
				if (! server.isRunning) {
					params.isRunning = false;
				}
			}
		}

		cmd = SystemInterface.createCommand (this.getCommandPrefix (), "AgentStatus", SystemInterface.Constant.DefaultCommandType, params);
		if (SystemInterface.isError (cmd)) {
			Log.write (Log.ERR, "Failed to create agent status command: " + cmd);
			return (null);
		}

		return (cmd);
	}

	// Return an object containing an AgentConfiguration command that reflects current state, or null if the command could not be created
	getConfiguration () {
		let params;

		params = { };
		for (let server of this.serverList) {
			server.getConfiguration (params);
		}
		params.isEnabled = this.isEnabled;
		params.displayName = this.displayName;

		return (SystemInterface.createCommand (this.getCommandPrefix (), "AgentConfiguration", SystemInterface.Constant.DefaultCommandType, params));
	}

	// Return an object containing an AgentContact command that reflects current state, or null if the contact command could not be created. The generated command uses a default prefix with empty fields to yield a shorter message.
	getContact () {
		var params;

		params = {
			id: this.agentId,
			urlHostname: this.urlHostname,
			tcpPort: this.httpServerPort,
			udpPort: this.datagramSocketPort,
			version: App.VERSION,
			nodeVersion: process.version
		};
		if (this.agentLinkUrl != "") {
			params.linkUrl = this.agentLinkUrl;
		}

		return (SystemInterface.createCommand (SystemInterface.createCommandPrefix (), "AgentContact", SystemInterface.Constant.DefaultCommandType, params));
	}

	// Update the state of the task map and invoke the provided callback when complete
	updateTaskMap (callback) {
		var agent, now, i, task, runcount, mintask, removelist, mapitem, taskitem, shouldwrite, cmd, result;

		agent = this;
		now = new Date ().getTime ();
		while (true) {
			if (agent.getRunCount () >= agent.maxRunCount) {
				break;
			}

			mintask = null;
			for (i in agent.taskMap) {
				task = agent.taskMap[i];
				if (task.isRunning || (task.startTime > 0)) {
					continue;
				}

				if ((mintask == null) || (task.id < mintask.id)) {
					mintask = task;
				}
			}

			if (mintask == null) {
				break;
			}

			mintask.run ();
			if (! mintask.isRunning) {
				Log.write (Log.DEBUG, mintask.toString () + " Failed to run, remove");

				// TODO: Possibly write a closed event record in this case

				delete (agent.taskRecordMap[mintask.id]);
				delete (agent.taskMap[mintask.id]);
			}
		}

		removelist = [ ];
		for (i in agent.taskMap) {
			task = agent.taskMap[i];
			if ((task.startTime > 0) && (task.endTime > 0)) {
				Log.write (Log.DEBUG, task.toString () + " ended, remove");
				removelist.push (task);
				continue;
			}

			if ((task.startTime <= 0) && task.isCancelled) {
				Log.write (Log.DEBUG, task.toString () + " cancelled, remove");
				removelist.push (task);
				continue;
			}
		}

		for (i = 0; i < removelist.length; ++i) {
			task = removelist[i];

			taskitem = task.getTaskItem ();
			cmd = SystemInterface.createCommand (agent.getCommandPrefix (), "TaskItem", task.recordCommandType, taskitem);
			if (SystemInterface.isError (cmd)) {
				Log.write (Log.ERR, "Failed to write task record; err=" + cmd);
			}
			else {
				SystemInterface.setRecordFields (cmd, taskitem.id, now);
				SystemInterface.closeRecord (cmd);
				result = agent.publishWriteEvents ([cmd]);
				if (result != Result.SUCCESS) {
					Log.write (Log.ERR, " Failed to write task record; recordId=\"" + taskitem.id + "\"");
				}
			}

			delete (agent.taskRecordMap[task.id]);
			delete (agent.taskMap[task.id]);
		}

		for (i in agent.taskMap) {
			task = agent.taskMap[i];
			taskitem = task.getTaskItem ();
			mapitem = agent.taskRecordMap[i];

			shouldwrite = false;
			if (mapitem == null) {
				shouldwrite = true;
			}
			else {
				if (mapitem.percentComplete != taskitem.percentComplete) {
					shouldwrite = true;
				}
			}
			agent.taskRecordMap[i] = taskitem;

			if (shouldwrite) {
				cmd = SystemInterface.createCommand (agent.getCommandPrefix (), "TaskItem", task.recordCommandType, taskitem);
				if (SystemInterface.isError (cmd)) {
					Log.write (Log.ERR, "Failed to write task record; err=" + cmd);
				}
				else {
					SystemInterface.setRecordFields (cmd, taskitem.id, now);
					result = agent.publishWriteEvents ([cmd]);
					if (result != Result.SUCCESS) {
						Log.write (Log.ERR, " Failed to write task record; recordId=\"" + taskitem.id + "\"");
					}
				}
			}
		}

		process.nextTick (callback);
	}

	// Return the number of tasks currently running
	getRunCount () {
		let count, task;

		count = 0;
		for (let i in this.taskMap) {
			task = this.taskMap[i];
			if (task.isRunning) {
				++count;
			}
		}

		return (count);
	}

	// Return the number of tasks running or waiting to be run
	getTaskQueueSize () {
		var i, count;

		count = 0;
		for (i in this.taskMap) {
			task = this.taskMap[i];
			if ((task.startTime <= 0) || task.isRunning) {
				++count;
			}
		}

		return (count);
	}

	// Add a task to the agent's map, assigning its ID value in the process. endCallback can be omitted if not needed.
	addTask (task, endCallback) {
		task.id = UuidV4 ();
		this.taskMap[task.id] = task;

		if (typeof endCallback == "function") {
			task.endCallback = endCallback;
		}
		Log.write (Log.DEBUG, task.toString () + " Added");
		this.updateTaskMapTask.setNextRepeat (0);
	}

	// Return the task with the specified ID, or null if no such task was found
	getTask (taskId) {
		return (this.taskMap[taskId]);
	}

	// Cancel a task, as specified in the provided CancelTask command
	cancelTask (cmdInv) {
		var task;

		task = this.taskMap[cmdInv.params.taskId];
		Log.write (Log.DEBUG, "Cancel task; cmdInv=" + JSON.stringify (cmdInv) + " task=" + ((task != null) ? task.toString () : "NULL"));
		if (task == null) {
			return;
		}

		task.cancel ();
		this.updateTaskMapTask.setNextRepeat (0);
	}

	// Notify the agent that it should publish an AgentStatus event as soon as possible
	publishStatus () {
		this.publishStatusEventTask.setNextRepeat (0);
	}

	// Return a SystemInterface command prefix object, suitable for use with the getCommandInvocation method
	getCommandPrefix (priority, startTime, duration) {
		// TODO: Possibly add auth hash fields to the prefix object
		if (typeof priority != "number") {
			priority = 0;
		}

		return (SystemInterface.createCommandPrefix (this.agentId, this.commandUserId, priority, startTime, duration));
	}

	// Execute an invocation on a remote agent URL using the provided command parameters, and invoke the provided callback when complete, with parameters named "err" (non-null if an error occurred), "invokeUrl" (the URL used for the invocation) and "cmdInv" (a command invocation parsed from response data).
	invokeAgentCommand (urlHostname, tcpPort, cmdInv, responseCommandId, callback) {
		var url, req, body;

		url = "http://" + urlHostname + ":" + tcpPort + "/?json=" + encodeURIComponent (JSON.stringify (cmdInv));
		if (SystemInterface.isError (cmdInv)) {
			if (callback != null) {
				process.nextTick (function () {
					callback ("Invalid command: " + cmdInv, url, null);
				});
			}
			return;
		}

		body = "";
		req = Http.get (url, requestStarted);
		req.on ("error", function (err) {
			endRequest (err, null);
		});

		function requestStarted (res) {
			if (res.statusCode != 200) {
				endRequest ("Non-success response code " + res.statusCode, null);
				return;
			}
			res.on ("error", function (err) {
				endRequest (err, null);
			});
			res.on ("data", function (data) {
				body += data;
			});
			res.on ("end", responseComplete);
		}

		function responseComplete () {
			endRequest (null, body);
		}

		function endRequest (err, data) {
			var cmdinv;

			if (callback != null) {
				if (err != null) {
					err = "[" + url + "] " + err;
				}

				cmdinv = null;
				if (err == null) {
					cmdinv = SystemInterface.parseCommand (data);
					if (SystemInterface.isError (cmdinv)) {
						err = "Response for \"" + cmdInv.commandName + "\" contained invalid command invocation, " + cmdinv;
						cmdinv = null;
					}
				}

				if ((err == null) && (typeof responseCommandId == "number")) {
					if (cmdinv.command != responseCommandId) {
						err = "Response for \"" + cmdInv.commandName + "\" contained invalid command type " + cmdinv.command + ", expected " + responseCommandId;
						cmdinv = null;
					}
				}

				if (err != null) {
					Log.write (Log.ERR, "[" + url + "] \"" + cmdInv.commandName + "\" failed: " + err);
				}

				callback (err, url, cmdinv);
				callback = null;
			}
		}
	}

	// Execute an HTTP GET operation for the provided URL and save response data into the specified path. Invokes the provided callback when complete, with parameters named "err" (non-null if an error occurred), "url" (the URL used for the invocation), and "destFile" (the path of the file that was written, or null if no file was written). A null targetFilename specifies that the fetch operation should name the file based on response data.
	fetchUrlFile (url, targetDirectory, targetFilename, callback) {
		var agent, httpreq, httpres, stream, tempfilename, destfilename;

		Log.write (Log.DEBUG3, "fetchUrlFile begin; url=" + url + " targetDirectory=" + targetDirectory + " targetFilename=" + targetFilename);
		agent = this;
		Fs.stat (targetDirectory, statTargetDirectoryComplete);
		function statTargetDirectoryComplete (err, stats) {
			if (err != null) {
				callback (err, url, null);
				return;
			}

			if (! stats.isDirectory ()) {
				callback (targetDirectory + " exists but is not a directory", url, null);
				return;
			}

			assignTempFilePath ();
		}

		function assignTempFilePath () {
			tempfilename = targetDirectory + "/urldata_" + new Date ().getTime () + "_" + agent.getRandomString (16);
			Fs.stat (tempfilename, statTempFilePathComplete);
		}

		function statTempFilePathComplete (err, stats) {
			if ((err != null) && (err.code != "ENOENT")) {
				callback (err, url, null);
				return;
			}

			if (stats != null) {
				assignTempFilePath ();
				return;
			}

			stream = Fs.createWriteStream (tempfilename);
			stream.on ("open", fileOpened);
			stream.on ("error", fileError);
		}

		function fileError (err) {
			if (callback != null) {
				if (err != null) {
					err = "[" + url + "] " + err;
				}

				callback (err, url, null);
				callback = null;
			}
			stream.close ();
		}

		function fileOpened () {
			httpreq = Http.get (url, requestStarted);
			httpreq.on ("error", function (err) {
				endRequest (err);
			});
		}

		function requestStarted (res) {
			var matchresult;

			httpres = res;
			if (httpres.statusCode != 200) {
				endRequest ("Non-success response code " + httpres.statusCode);
				return;
			}

			destfilename = null;
			if (targetFilename != null) {
				destfilename = targetDirectory + "/" + targetFilename;
			}

			if (destfilename == null) {
				val = httpres.headers["content-disposition"];
				if (typeof val == "string") {
					matchresult = val.match (/^attachment; filename=(.*)/);
					if (matchresult != null) {
						destfilename = targetDirectory + "/" + matchresult[1];
					}
				}
			}

			httpres.on ("error", function (err) {
				endRequest (err);
			});
			httpres.on ("data", function (data) {
				stream.write (data);
			});
			httpres.on ("end", responseComplete);
		}

		function responseComplete () {
			stream.end ();
			stream.once ("finish", streamFinished)
		}

		function streamFinished () {
			endRequest (null);
		}

		function endRequest (err) {
			if (err != null) {
				Fs.unlink (tempfilename, function () { });
				if (callback != null) {
					callback (err, url, null);
					callback = null;
				}
				return;
			}

			if (destfilename == null) {
				// TODO: Rename the target file using the URL path
				if (callback != null) {
					callback (null, url, tempfilename);
					callback = null;
				}
				return;
			}

			Fs.rename (tempfilename, destfilename, renameComplete);
		}

		function renameComplete (err) {
			if (err != null) {
				Fs.unlink (tempfilename, function () { });
				if (callback != null) {
					callback (err, url, null);
					callback = null;
				}
				return;
			}

			if (callback != null) {
				callback (null, url, destfilename);
				callback = null;
			}
		}
	}

	// Return a randomly generated string of characters using the specified length
	getRandomString (length) {
		var s, chars;

		chars = [ "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9" ];
		s = "";
		while (s.length < length) {
			s += chars[Math.floor (Math.random () * chars.length)];
		}

		return (s);
	}

	// Return a randomly selected integer number in the provided inclusive range
	getRandomInteger (min, max) {
		if (max <= min) {
			return (Math.floor (max));
		}

		return (Math.round (min + (Math.random () * (max - min))));
	}

	// Return a number value specifying a millisecond delay, suitable for use as a heartbeat period
	getHeartbeatDelay () {
		var delay;

		delay = App.HEARTBEAT_PERIOD;
		delay += Math.floor (Math.random () * 128);

		return (delay);
	}

	// Return a string containing the provided path value with the agent bin path prepended if it doesn't already contain a base path
	getRunPath (path) {
		var runpath;

		runpath = path;
		if (runpath.indexOf ("/") !== 0) {
			runpath = App.BIN_DIRECTORY + "/" + runpath;
		}

		return (runpath);
	}

	// Return a newly created AgentProcess object that launches ffmpeg. workingPath defaults to the application data directory if empty.
	createFfmpegProcess (runArgs, workingPath, processData, processEnded) {
		let runpath, env;

		runpath = App.FFMPEG_PATH;
		env = { };
		if (runpath == "") {
			if (process.platform == "win32") {
				runpath = "ffmpeg/bin/ffmpeg.exe";
			}
			else if (process.platform == "linux") {
				runpath = "ffmpeg/ffmpeg";
				env.LD_LIBRARY_PATH = App.BIN_DIRECTORY + "/ffmpeg/lib";
			}
			else {
				runpath = "ffmpeg";
			}
		}

		return (new AgentProcess (runpath, runArgs, env, workingPath, processData, processEnded));
	}

	// Return a newly created AgentProcess object that launches curl. workingPath defaults to the application data directory if empty.
	createCurlProcess (runArgs, workingPath, processData, processEnded) {
		let runpath, env;

		runpath = App.CURL_PATH;
		env = { };
		if (runpath == "") {
			if (process.platform == "win32") {
				runpath = App.BIN_DIRECTORY + "/curl.exe";
			}
			else {
				runpath = App.BIN_DIRECTORY + "/curl";
			}
		}

		return (new AgentProcess (runpath, runArgs, env, workingPath, processData, processEnded));
	}

}

module.exports = SystemAgent;
