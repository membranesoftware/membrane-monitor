/*
* Copyright 2019 Membrane Software <author@membranesoftware.com>
*                 https://membranesoftware.com
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are met:
*
* 1. Redistributions of source code must retain the above copyright notice,
* this list of conditions and the following disclaimer.
*
* 2. Redistributions in binary form must reproduce the above copyright notice,
* this list of conditions and the following disclaimer in the documentation
* and/or other materials provided with the distribution.
*
* 3. Neither the name of the copyright holder nor the names of its contributors
* may be used to endorse or promote products derived from this software without
* specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
* AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
* IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
* LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
* SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
* INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
* CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
* POSSIBILITY OF SUCH DAMAGE.
*/
"use strict";

const App = global.App || { };
const Path = require ("path");
const Fs = require ("fs");
const EventEmitter = require ("events").EventEmitter;
const Result = require (App.SOURCE_DIRECTORY + "/Result");
const Log = require (App.SOURCE_DIRECTORY + "/Log");
const SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");
const FsUtil = require (App.SOURCE_DIRECTORY + "/FsUtil");
const ExecProcess = require (App.SOURCE_DIRECTORY + "/ExecProcess");
const RepeatTask = require (App.SOURCE_DIRECTORY + "/RepeatTask");
const Intent = require (App.SOURCE_DIRECTORY + "/Intent/Intent");
const Task = require (App.SOURCE_DIRECTORY + "/Task/Task");
const ServerBase = require (App.SOURCE_DIRECTORY + "/Server/ServerBase");

const THUMBNAIL_PATH = "/monitor/thumbnail.png";
const XSET_OFF_PROCESS_NAME = "xset-off.sh";
const XSET_ACTIVATE_PROCESS_NAME = "xset-activate.sh";
const OMXPLAYER_PLAY_PROCESS_NAME = "omxplayer-play.sh";
const OMXPLAYER_STOP_PROCESS_NAME = "omxplayer-stop.sh";
const CHROMIUM_START_PROCESS_NAME = "chromium-start.sh";
const CHROMIUM_STOP_PROCESS_NAME = "chromium-stop.sh";
const CHROMIUM_FIND_PROCESS_NAME = "chromium-find-process.sh";
const FIND_BROWSER_PROCESS_PERIOD = 15000; // milliseconds
const GET_DISK_SPACE_PERIOD = 15 * 60 * 1000; // milliseconds
const CLEAR_COMPLETE_EVENT = "clearComplete";

class MonitorServer extends ServerBase {
	constructor () {
		super ();
		this.name = "MonitorServer";
		this.description = "Accept and execute commands to control content shown by a display";

		this.configureParams = [
		];

		this.isPlaying = false;
		this.playProcess = null;
		this.playMediaName = "";
		this.isBrowserRunning = false;
		this.findBrowserProcessTimeout = null;
		this.isFindingBrowserProcess = false;
		this.browserUrl = "";
		this.totalStorage = 0; // bytes
		this.freeStorage = 0; // bytes
		this.usedStorage = 0; // bytes
		this.getDiskSpaceTask = new RepeatTask ();
		this.cacheDataPath = Path.join (App.DATA_DIRECTORY, App.STREAM_CACHE_PATH);

		this.emitter = new EventEmitter ();
		this.emitter.setMaxListeners (0);
		this.isClearing = false;

		// A map of stream ID values to StreamItem commands
		this.streamMap = { };

		// A map of stream ID values to StreamItem commands
		this.streamSourceMap = { };
	}

	// Start the server's operation and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred)
	doStart (startCallback) {
		let deactivateDesktopBlankComplete;

		FsUtil.createDirectory (this.cacheDataPath).then (() => {
			return (Task.executeTask ("GetDiskSpace", { targetPath: this.cacheDataPath }));
		}).then ((resultObject) => {
			this.totalStorage = resultObject.total;
			this.usedStorage = resultObject.used;
			this.freeStorage = resultObject.free;

			return (this.readStreamCache ());
		}).then (() => {
			App.systemAgent.addInvokeRequestHandler ("/", SystemInterface.Constant.Monitor, (cmdInv) => {
				switch (cmdInv.command) {
					case SystemInterface.CommandId.GetStatus: {
						return (this.getStatus ());
					}
					case SystemInterface.CommandId.ClearDisplay: {
						return (this.clearDisplay (cmdInv));
					}
					case SystemInterface.CommandId.PlayMedia: {
						return (this.playMedia (cmdInv));
					}
					case SystemInterface.CommandId.PlayCacheStream: {
						return (this.playCacheStream (cmdInv));
					}
					case SystemInterface.CommandId.CreateCacheStream: {
						return (this.createCacheStream (cmdInv));
					}
					case SystemInterface.CommandId.RemoveStream: {
						return (this.removeStream (cmdInv));
					}
					case SystemInterface.CommandId.ClearCache: {
						return (this.clearCache (cmdInv));
					}
					case SystemInterface.CommandId.ShowWebUrl: {
						return (this.showWebUrl (cmdInv));
					}
					case SystemInterface.CommandId.CreateWebDisplayIntent: {
						return (this.createWebDisplayIntent (cmdInv));
					}
					case SystemInterface.CommandId.CreateMediaDisplayIntent: {
						return (this.createMediaDisplayIntent (cmdInv));
					}
				}
				return (null);
			});

			App.systemAgent.addLinkCommandHandler (SystemInterface.Constant.Monitor, (client, cmdInv) => {
				switch (cmdInv.command) {
					case SystemInterface.CommandId.FindItems: {
						this.findItems (client, cmdInv);
						break;
					}
				}
			});

			App.systemAgent.addSecondaryRequestHandler (THUMBNAIL_PATH, (cmdInv, request, response) => {
				switch (cmdInv.command) {
					case SystemInterface.CommandId.GetThumbnailImage: {
						this.getThumbnailImage (cmdInv, request, response);
						break;
					}
					default: {
						App.systemAgent.endRequest (request, response, 400, "Bad request");
						break;
					}
				}
			});

			this.getDiskSpaceTask.setRepeating ((callback) => {
				Task.executeTask ("GetDiskSpace", { targetPath: this.cacheDataPath }).then ((resultObject) => {
					this.totalStorage = resultObject.total;
					this.usedStorage = resultObject.used;
					this.freeStorage = resultObject.free;
					callback ();
				}).catch ((err) => {
					callback ();
				});
			}, GET_DISK_SPACE_PERIOD);

			this.deactivateDesktopBlank (() => {
				startCallback ();
			});
		}).catch ((err) => {
			startCallback (err);
		});
	}

	// Return a promise that reads stream records from the cache
	readStreamCache () {
		return (new Promise ((resolve, reject) => {
			let ids, idindex, streampath, streamrecord, readDirectoryComplete, readNextStream, readRecordFileComplete, statFilesComplete, removeStreamDirectory;

			ids = [ ];
			streamrecord = null;
			setTimeout (() => {
				FsUtil.readDirectory (this.cacheDataPath, readDirectoryComplete);
			}, 0);

			readDirectoryComplete = (err, files) => {
				if (err != null) {
					reject (err);
					return;
				}

				for (let file of files) {
					if (App.systemAgent.getUuidCommand (file) == SystemInterface.CommandId.StreamItem) {
						ids.push (file);
					}
				}

				idindex = -1;
				readNextStream ();
			};

			readNextStream = () => {
				++idindex;
				if (idindex >= ids.length) {
					resolve ();
					return;
				}

				streampath = Path.join (this.cacheDataPath, ids[idindex]);
				Fs.readFile (Path.join (streampath, App.STREAM_RECORD_FILENAME), readRecordFileComplete);
			};

			readRecordFileComplete = (err, data) => {
				let filenames;

				if (err != null) {
					removeStreamDirectory ();
					return;
				}

				streamrecord = SystemInterface.parseCommand (data.toString ());
				if ((streamrecord == null) || (streamrecord.command != SystemInterface.CommandId.StreamItem))  {
					removeStreamDirectory ();
					return;
				}

				filenames = [ ];
				for (let i = 0; i < streamrecord.params.segmentCount; ++i) {
					filenames.push (Path.join (streampath, App.STREAM_HLS_PATH, i + ".ts"));
					filenames.push (Path.join (streampath, App.STREAM_THUMBNAIL_PATH, i + ".jpg"));
				}
				FsUtil.statFiles (filenames, (filename, stats) => {
					return (stats.isFile () && (stats.size > 0));
				}, statFilesComplete);
			};

			statFilesComplete = (err) => {
				if (err != null) {
					removeStreamDirectory ();
					return;
				}

				this.streamMap[streamrecord.params.id] = streamrecord;
				if (streamrecord.params.sourceId != "") {
					this.streamSourceMap[streamrecord.params.sourceId] = streamrecord;
				}
				readNextStream ();
			};

			removeStreamDirectory = () => {
				Log.warn (`${this.toString ()} Invalid stream cache entry, deleted; path=${streampath}`);
				FsUtil.removeDirectory (streampath, readNextStream);
			};
		}));
	}

	// Execute subclass-specific stop operations and invoke the provided callback when complete
	doStop (stopCallback) {
		this.getDiskSpaceTask.stop ();
		this.clear (stopCallback);
	}

	// Return a command invocation containing the server's status
	doGetStatus (cmdInv) {
		let params, intents;

		params = {
			freeStorage: this.freeStorage,
			totalStorage: this.totalStorage,
			streamCount: Object.keys (this.streamMap).length,
			thumbnailPath: THUMBNAIL_PATH,
			isPlaying: this.isPlaying,
			mediaName: this.isPlaying ? this.playMediaName : "",
			isShowingUrl: this.isBrowserRunning,
			showUrl: this.browserUrl
		};

		intents = App.systemAgent.findIntents (this.name, true);
		if (intents.length > 0) {
			params.intentName = intents[0].displayName;
		}

		return (this.createCommand ("MonitorServerStatus", SystemInterface.Constant.Monitor, params));
	}

	// Execute a ClearDisplay command and return a result command
	clearDisplay (cmdInv) {
		App.systemAgent.removeIntentGroup (this.name);
		this.clear (function () { });
		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Execute a PlayMedia command and return a result command
	playMedia (cmdInv) {
		let proc, item, playparams, playcmd, playid, clearComplete, activateDesktopBlankComplete, playProcessEnded;

		if (typeof cmdInv.params.streamId == "string") {
			playid = "";
			if (this.streamMap[cmdInv.params.streamId] != null) {
				playid = cmdInv.params.streamId;
			}
			else {
				item = this.streamSourceMap[cmdInv.params.streamId];
				if (item != null) {
					playid = item.params.id;
				}
			}

			if (playid != "") {
				playparams = {
					streamId: playid
				};
				if (typeof cmdInv.params.startPosition == "number") {
					playparams.startPosition = cmdInv.params.startPosition;
				}
				if ((typeof cmdInv.params.minStartPositionDelta == "number") && (typeof cmdInv.params.maxStartPositionDelta == "number")) {
					playparams.minStartPositionDelta = cmdInv.params.minStartPositionDelta;
					playparams.maxStartPositionDelta = cmdInv.params.maxStartPositionDelta;
				}
				playcmd = this.createCommand ("PlayCacheStream", SystemInterface.Constant.Monitor, playparams);
				if (playcmd != null) {
					return (this.playCacheStream (playcmd));
				}
			}
		}
		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}

		setTimeout (() => {
			this.clear (clearComplete);
		}, 0);
		clearComplete = () => {
			this.playMediaName = cmdInv.params.mediaName;
			this.isPlaying = true;
			this.activateDesktopBlank (activateDesktopBlankComplete);
		};
		activateDesktopBlankComplete = () => {
			proc = new ExecProcess (OMXPLAYER_PLAY_PROCESS_NAME, [ ], {
				WORKING_DIR: App.DATA_DIRECTORY,
				TARGET_MEDIA: cmdInv.params.streamUrl
			}, "", null, playProcessEnded);
			this.playProcess = proc;
		};

		playProcessEnded = () => {
			if (proc != this.playProcess) {
				return;
			}
			this.playProcess = null;
			this.isPlaying = false;
		};

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Execute a PlayCacheStream command and return a result command
	playCacheStream (cmdInv) {
		let item, proc, indexpath, indexdata, firstsegment, pct, delta, writeIndexFileComplete, clearComplete, activateDesktopBlankComplete, playProcessEnded;

		item = this.streamMap[cmdInv.params.streamId];
		if (item == null) {
			return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false,
				error: "Stream not found"
			}));
		}

		if (App.systemAgent.memoryFilePath != "") {
			indexpath = Path.join (App.systemAgent.memoryFilePath, App.STREAM_HLS_INDEX_FILENAME);
		}
		else {
			indexpath = Path.join (this.cacheDataPath, App.STREAM_HLS_INDEX_FILENAME);
		}
		firstsegment = 0;
		pct = 0;
		delta = 0;
		if ((typeof cmdInv.params.startPosition == "number") && (cmdInv.params.startPosition > 0)) {
			for (let i = 0; i < item.params.segmentCount; ++i) {
				if (item.params.segmentPositions[i] >= cmdInv.params.startPosition) {
					firstsegment = i;
					break;
				}
			}
		}

		if ((typeof cmdInv.params.minStartPositionDelta == "number") && (typeof cmdInv.params.maxStartPositionDelta == "number")) {
			if (((cmdInv.params.minStartPositionDelta > 0) || (cmdInv.params.maxStartPositionDelta > 0)) && (cmdInv.params.minStartPositionDelta <= cmdInv.params.maxStartPositionDelta)) {
				pct = App.systemAgent.getRandomInteger (cmdInv.params.minStartPositionDelta, cmdInv.params.maxStartPositionDelta);
				if (pct < 0) {
					pct = 0;
				}
				if (pct > 99) {
					pct = 99;
				}
				delta = Math.floor ((pct / 100) * (item.params.segmentCount - firstsegment + 1));
				firstsegment += delta;
				if (firstsegment >= (item.params.segmentCount - 2)) {
					firstsegment = item.params.segmentCount - 2;
				}
			}
		}
		indexdata = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-ALLOW-CACHE:NO\n";
		if (item.params.hlsTargetDuration > 0) {
			indexdata += "#EXT-X-TARGETDURATION:" + item.params.hlsTargetDuration + "\n";
		}
		else {
			indexdata += "#EXT-X-TARGETDURATION:5\n";
		}
		for (let i = firstsegment; i < item.params.segmentCount; ++i) {
			indexdata += "#EXTINF:" + item.params.segmentLengths[i] + ",\n";
			indexdata += Path.join (this.cacheDataPath, item.params.id, App.STREAM_HLS_PATH, item.params.segmentFilenames[i]) + "\n";
		}
		indexdata += "#EXT-X-ENDLIST\n";

		setTimeout (() => {
			Fs.writeFile (indexpath, indexdata, { }, writeIndexFileComplete);
		}, 0);
		writeIndexFileComplete = (err) => {
			if (err != null) {
				Log.debug (`${this.toString ()} failed to play cache stream; err=${err}`);
				return;
			}

			if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
				App.systemAgent.removeIntentGroup (this.name);
			}
			this.clear (clearComplete);
		};
		clearComplete = () => {
			this.playMediaName = item.params.name;
			this.isPlaying = true;
			this.activateDesktopBlank (activateDesktopBlankComplete);
		};
		activateDesktopBlankComplete = () => {
			proc = new ExecProcess (OMXPLAYER_PLAY_PROCESS_NAME, [ ], {
				WORKING_DIR: App.DATA_DIRECTORY,
				TARGET_MEDIA: indexpath
			}, "", null, playProcessEnded);
			this.playProcess = proc;
		};

		playProcessEnded = () => {
			if (proc != this.playProcess) {
				return;
			}
			this.playProcess = null;
			this.isPlaying = false;
		};

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Execute a ClearCache command and return a result command
	clearCache (cmdInv) {
		let clearComplete, removeDirectoryComplete, createDirectoryComplete;

		App.systemAgent.removeIntentGroup (this.name);
		setTimeout (() => {
			this.clear (clearComplete);
		}, 0);
		clearComplete = () => {
			this.streamMap = { };
			this.streamSourceMap = { };
			FsUtil.removeDirectory (this.cacheDataPath, removeDirectoryComplete);
		};
		removeDirectoryComplete = (err) => {
			if (err != null) {
				Log.warn (`Failed to remove cache files; path=${this.cacheDataPath} err=${err}`);
				return;
			}

			FsUtil.createDirectory (this.cacheDataPath, createDirectoryComplete);
		};

		createDirectoryComplete = (err) => {
			if (err != null) {
				Log.warn (`Failed to create cache data directory; path=${this.cacheDataPath} err=${err}`);
			}
			this.getDiskSpaceTask.setNextRepeat (0);
		};

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Stop all running display processes
	clear (clearCallback) {
		let stopOmxplayerComplete, stopChromiumComplete, endClear;

		this.emitter.once (CLEAR_COMPLETE_EVENT, clearCallback);
		if (this.isClearing) {
			return;
		}
		this.isClearing = true;
		this.stopOmxplayer (() => {
			stopOmxplayerComplete ();
		});
		stopOmxplayerComplete = () => {
			this.stopChromium (stopChromiumComplete);
		};
		stopChromiumComplete = () => {
			endClear ();
		};

		endClear = () => {
			this.isClearing = false;
			this.emitter.emit (CLEAR_COMPLETE_EVENT);
		};
	}

	// Stop any active omxplayer process and invoke the provided callback when complete
	stopOmxplayer (callback) {
		let proc, playproc;

		playproc = this.playProcess;
		if (playproc == null) {
			if (callback != null) {
				process.nextTick (callback);
			}
			return;
		}
		this.playProcess = null;
		this.isPlaying = false;

		proc = new ExecProcess (OMXPLAYER_STOP_PROCESS_NAME, [ ], {
			SIGNAL_TYPE: "TERM"
		}, "", null, callback);

		// TODO: Possibly repeat the operation with a KILL signal
	}

	// Stop any active chromium process and invoke the provided callback when complete
	stopChromium (callback) {
		let proc;

		if (! this.isBrowserRunning) {
			if (callback != null) {
				process.nextTick (callback);
			}
			return;
		}

		proc = new ExecProcess (CHROMIUM_STOP_PROCESS_NAME, [ ], { }, "", null, callback);
	}

	// Execute a ShowWebUrl command and return a result command
	showWebUrl (cmdInv) {
		let clearComplete, deactivateDesktopBlankComplete;
		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}

		setTimeout (() => {
			this.clear (clearComplete);
		}, 0);
		clearComplete = () => {
			this.deactivateDesktopBlank (deactivateDesktopBlankComplete);
		};
		deactivateDesktopBlankComplete = () => {
			let proc;

			proc = new ExecProcess (CHROMIUM_START_PROCESS_NAME, [ ], {
				TARGET_URL: cmdInv.params.url
			}, "", null, null);

			this.isBrowserRunning = true;
			this.browserUrl = cmdInv.params.url;
			if (this.findBrowserProcessTimeout != null) {
				clearTimeout (this.findBrowserProcessTimeout);
			}
			this.findBrowserProcessTimeout = setTimeout (() => {
				this.findBrowserProcess ();
			}, FIND_BROWSER_PROCESS_PERIOD);
		};

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Execute operations to check if a browser process is running and update the isBrowserRunning data member
	findBrowserProcess () {
		let proc, found, procDataCallback, procEndCallback;

		if (this.isFindingBrowserProcess) {
			return;
		}

		this.isFindingBrowserProcess = true;
		found = false;

		procDataCallback = (lines, parseCallback) => {
			// The chromium-find-process.sh script prints "true" if the process was found
			for (let i = 0; i < lines.length; i++) {
				if (lines[i] == "true") {
					found = true;
				}
			}

			process.nextTick (parseCallback);
		};

		procEndCallback = () => {
			this.isFindingBrowserProcess = false;
			this.isBrowserRunning = found;

			if (! found) {
				this.browserUrl = "";
			}
			else {
				this.findBrowserProcessTimeout = setTimeout (() => {
					this.findBrowserProcess ();
				}, FIND_BROWSER_PROCESS_PERIOD);
			}
		};

		proc = new ExecProcess (CHROMIUM_FIND_PROCESS_NAME, [ ], { }, "", procDataCallback, procEndCallback);
	}

	// Deactivate and disable desktop screen blank functionality and invoke the provided callback when complete
	deactivateDesktopBlank (endCallback) {
		let proc;

		proc = new ExecProcess (XSET_OFF_PROCESS_NAME, [ ], { }, "", null, endCallback);
	}

	// Activate the desktop screen blank and invoke the provided callback when complete
	activateDesktopBlank (endCallback) {
		let proc;

		proc = new ExecProcess (XSET_ACTIVATE_PROCESS_NAME, [ ], { }, "", null, endCallback);
	}

	// Start an intent to show web content on display agents and return a CommandResult command
	createWebDisplayIntent (cmdInv) {
		let intent, params;

		params = {
			success: false,
			error: ""
		};
		intent = Intent.createIntent ("WebDisplayIntent", cmdInv.params);
		if (intent == null) {
			params.error = "Internal server error";
		}
		else {
			App.systemAgent.removeIntentGroup (this.name);
			App.systemAgent.runIntent (intent, this.name);
			params.success = true;
		}

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, params));
	}

	// Start an intent to show media content on display agents and return a CommandResult command
	createMediaDisplayIntent (cmdInv) {
		let intent, params;

		params = {
			success: false,
			error: ""
		};
		intent = Intent.createIntent ("MediaDisplayIntent", cmdInv.params);
		if (intent == null) {
			params.error = "Internal server error";
		}
		else {
			App.systemAgent.removeIntentGroup (this.name);
			App.systemAgent.runIntent (intent, this.name);
			params.success = true;
		}

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, params));
	}

	// Execute a CreateCacheStream command and return a result command
	createCacheStream (cmdInv) {
		let item, task;

		item = this.streamSourceMap[cmdInv.params.streamId];
		if (item != null) {
			return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: true
			}));
		}

		task = Task.createTask ("CacheMediaStream", {
			streamId: cmdInv.params.streamId,
			streamUrl: cmdInv.params.streamUrl,
			thumbnailUrl: cmdInv.params.thumbnailUrl,
			dataPath: this.cacheDataPath,
			streamName: cmdInv.params.streamName,
			duration: cmdInv.params.duration,
			width: cmdInv.params.width,
			height: cmdInv.params.height,
			bitrate: cmdInv.params.bitrate,
			frameRate: cmdInv.params.frameRate
		});
		if (task == null) {
			return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false,
				error: "Internal server error"
			}));
		}

		App.systemAgent.runTask (task, (task) => {
			let record;
			if (task.isSuccess) {
				record = App.systemAgent.createCommand ("StreamItem", SystemInterface.Constant.Stream, task.resultObject);
				if (record == null) {
					Log.debug (`${this.toString ()} failed to create stream cache entry; err=Invalid StreamItem record`);
				}
				else {
					this.streamMap[task.resultObject.id] = record;
					if (task.resultObject.sourceId != "") {
						this.streamSourceMap[task.resultObject.sourceId] = record;
					}
				}
			}
			this.getDiskSpaceTask.setNextRepeat (0);
		});

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Execute a RemoveStream command and return a command invocation result
	removeStream (cmdInv) {
		let item, removepath;

		item = this.streamMap[cmdInv.params.id];
		if (item == null) {
			return (server.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false
			}));
		}

		removepath = Path.join (this.cacheDataPath, cmdInv.params.id);
		delete (this.streamMap[cmdInv.params.id]);

		FsUtil.removeDirectory (removepath, (err) => {
			if (err != null) {
				Log.warn (`Failed to remove cache stream directory; path=${removepath} err=${err}`);
			}
			this.getDiskSpaceTask.setNextRepeat (0);
		});

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Execute a FindItems command and write result commands to the provided client
	findItems (client, cmdInv) {
		let cmd;

		// This FindItems handler does not implement search key filters or result offsets

		cmd = this.createCommand ("FindStreamsResult", SystemInterface.Constant.Monitor, {
			searchKey: "",
			setSize: Object.keys (this.streamMap).length,
			resultOffset: 0
		});
		if (cmd != null) {
			client.emit (SystemInterface.Constant.WebSocketEvent, cmd);
		}
		for (let record of Object.values (this.streamMap)) {
			client.emit (SystemInterface.Constant.WebSocketEvent, record);
		}
	}

	// Handle a request with a GetThumbnailImage command
	getThumbnailImage (cmdInv, request, response) {
		let path, item;

		item = this.streamMap[cmdInv.params.id];
		if (item == null) {
			response.statusCode = 404;
			response.end ();
			return;
		}

		if (cmdInv.params.thumbnailIndex >= item.params.segmentCount) {
			response.statusCode = 404;
			response.end ();
			return;
		}

		path = Path.join (this.cacheDataPath, cmdInv.params.id, App.STREAM_THUMBNAIL_PATH, cmdInv.params.thumbnailIndex + ".jpg");
		Fs.stat (path, (err, stats) => {
			let stream, isopen;

			if (err != null) {
				Log.err (`${this.toString ()} error reading thumbnail file; path=${path} err=${err}`);
				response.statusCode = 404;
				response.end ();
				return;
			}

			if (! stats.isFile ()) {
				Log.err (`${this.toString ()} error reading thumbnail file; path=${path} err=Not a regular file`);
				response.statusCode = 404;
				response.end ();
				return;
			}

			isopen = false;
			stream = Fs.createReadStream (path, { });
			stream.on ("error", (err) => {
				Log.err (`${this.toString ()} error reading thumbnail file; path=${path} err=${err}`);
				if (! isopen) {
					response.statusCode = 500;
					response.end ();
				}
			});

			stream.on ("open", () => {
				if (isopen) {
					return;
				}

				isopen = true;
				response.statusCode = 200;
				response.setHeader ("Content-Type", "image/jpeg");
				response.setHeader ("Content-Length", stats.size);
				stream.pipe (response);
				stream.on ("finish", () => {
					response.end ();
				});

				response.socket.setMaxListeners (0);
				response.socket.once ("error", (err) => {
					stream.close ();
				});
			});
		});
	}
}
module.exports = MonitorServer;
