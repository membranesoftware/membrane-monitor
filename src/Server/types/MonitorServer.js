/*
* Copyright 2018-2020 Membrane Software <author@membranesoftware.com> https://membranesoftware.com
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

const THUMBNAIL_PATH = "/mon/a.jpg";
const SCREENSHOT_PATH = "/mon/b.jpg";
const SCREENSHOT_FILENAME = "screenshot.jpg";
const RUNLEVEL_PROCESS_NAME = "/sbin/runlevel";
const XSET_PROCESS_NAME = "/usr/bin/xset";
const PS_PROCESS_NAME = "/bin/ps";
const KILLALL_PROCESS_NAME = "/usr/bin/killall";
const CHROMIUM_PROCESS_NAME = "/usr/bin/chromium-browser";
const OMXPLAYER_PROCESS_NAME = "/usr/bin/omxplayer";
const SCROT_PROCESS_NAME = "/usr/bin/scrot";
const XDPYINFO_PROCESS_NAME = "/usr/bin/xdpyinfo";
const XDOTOOL_PROCESS_NAME = "/usr/bin/xdotool";
const GET_DISPLAY_INFO_PERIOD = 27500; // milliseconds
const RUN_BROWSER_PROCESS_PERIOD = 1000; // milliseconds
const FIND_BROWSER_PROCESS_PERIOD = 15000; // milliseconds
const GET_DISK_SPACE_PERIOD = 15 * 60 * 1000; // milliseconds
const CLEAR_COMPLETE_EVENT = "clearComplete";

class MonitorServer extends ServerBase {
	constructor () {
		super ();
		this.name = "MonitorServer";
		this.description = "Accept and execute commands to control content shown by a display";

		this.configureParams = [
			{
				name: "xDisplay",
				type: "string",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.NotEmpty,
				description: "The display name to target for X server commands, or \"none\" to disable X server commands",
				defaultValue: ":0.0"
			},
			{
				name: "screenshotPeriod",
				type: "number",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.ZeroOrGreater,
				description: "The interval to use for periodic screenshot capture, in seconds, or zero to disable periodic screenshots",
				defaultValue: 30
			}
		];

		this.lastStatus = null;
		this.displayWidth = 0;
		this.displayHeight = 0;
		this.isPlaying = false;
		this.playProcess = null;
		this.playMediaName = "";
		this.isPlayPaused = false;
		this.xDisplay = "";
		this.isShowUrlAvailable = false;
		this.isShowingUrl = false;
		this.browserProcess = null;
		this.browserUrl = "";
		this.findBrowserProcessTask = new RepeatTask ();
		this.runBrowserProcessTask = new RepeatTask ();
		this.getDisplayInfoTask = new RepeatTask ();
		this.totalStorage = 0; // bytes
		this.freeStorage = 0; // bytes
		this.usedStorage = 0; // bytes
		this.getDiskSpaceTask = new RepeatTask ();
		this.cacheDataPath = Path.join (App.DATA_DIRECTORY, App.STREAM_CACHE_PATH);

		this.emitter = new EventEmitter ();
		this.emitter.setMaxListeners (0);
		this.isClearing = false;

		this.screenshotTask = new RepeatTask ();
		this.screenshotTime = 0;

		// A map of stream ID values to StreamItem commands
		this.streamMap = { };

		// A map of stream ID values to StreamItem commands
		this.streamSourceMap = { };
	}

	// Start the server's operation and invoke the provided callback when complete, with an "err" parameter (non-null if an error occurred)
	doStart (startCallback) {
		let deactivateDesktopBlankComplete;

		this.isPlayPaused = false;
		if (this.configureMap.xDisplay.toLowerCase () == "none") {
			Log.info (`${this.toString ()} X server commands disabled by configuration, xDisplay=none`);
		}
		else {
			this.xDisplay = this.configureMap.xDisplay;
		}

		FsUtil.createDirectory (this.cacheDataPath).then (() => {
			return (Task.executeTask ("GetDiskSpace", { targetPath: this.cacheDataPath }));
		}).then ((resultObject) => {
			this.totalStorage = resultObject.total;
			this.usedStorage = resultObject.used;
			this.freeStorage = resultObject.free;
			return (this.awaitSystemReady ());
		}).then (() => {
			return (this.getDisplayInfo ());
		}).then (() => {
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
					case SystemInterface.CommandId.PauseMedia: {
						return (this.pauseMedia (cmdInv));
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

			App.systemAgent.addSecondaryRequestHandler (SCREENSHOT_PATH, (cmdInv, request, response) => {
				let path;

				if (this.screenshotTime <= 0) {
					App.systemAgent.endRequest (request, response, 404, "Not found");
					return;
				}

				path = Path.join (App.DATA_DIRECTORY, SCREENSHOT_FILENAME);
				App.systemAgent.writeFileResponse (request, response, path, "image/jpeg");
			});

			if (this.xDisplay != "") {
				this.getDisplayInfoTask.setRepeating ((callback) => {
					this.getDisplayInfo ().catch ((err) => {
						// Do nothing
					}).then (() => {
						callback ();
					});
				}, GET_DISPLAY_INFO_PERIOD);
			}

			if (this.configureMap.screenshotPeriod > 0) {
				this.screenshotTask.setRepeating ((callback) => {
					this.captureScreenshot (callback);
				}, this.configureMap.screenshotPeriod * 1000);
			}

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

			App.systemAgent.getApplicationNews ();
			this.deactivateDesktopBlank (() => {
				startCallback ();
			});
		}).catch ((err) => {
			startCallback (err);
		});
	}

	// Return a promise that waits until the host system becomes ready to execute monitor operations
	awaitSystemReady () {
		return (new Promise ((resolve, reject) => {
			let runlevel, task;

			runlevel = "";
			task = new RepeatTask ();
			task.setRepeating ((callback) => {
				App.systemAgent.runProcess (RUNLEVEL_PROCESS_NAME, [ ], { }, "", (lines, parseCallback) => {
					if (runlevel == "") {
						for (let line of lines) {
							if (line.indexOf ("unknown") < 0) {
								runlevel = line;
								break;
							}
						}
					}
					process.nextTick (parseCallback);
				}).then ((isExitSuccess) => {
					if (runlevel != "") {
						task.stop ();
						resolve ();
					}
				}).catch ((err) => {
					Log.err (`Error reading system ready state; err=${err}`);
					task.stop ();
					reject (err);
				}).then (() => {
					callback ();
				});
			}, App.HEARTBEAT_PERIOD * 4);
		}));
	}

	// Return a promise that reads and stores display info values
	getDisplayInfo () {
		return (new Promise ((resolve, reject) => {
			let displaywidth, displayheight;

			if (this.xDisplay == "") {
				resolve ();
				return;
			}

			Log.debug (`${this.toString ()} getDisplayInfo; xDisplay=${this.xDisplay}`);
			displaywidth = 0;
			displayheight = 0;
			App.systemAgent.runProcess (XDPYINFO_PROCESS_NAME, [ ], { "DISPLAY": this.xDisplay }, "", (lines, parseCallback) => {
				let m;

				for (let line of lines) {
					m = line.match (/dimensions:.*?([0-9]+)x([0-9]+)[^0-9]/);
					if (m != null) {
						displaywidth = parseInt (m[1]);
						displayheight = parseInt (m[2]);
					}
				}
				process.nextTick (parseCallback);
			}).then ((isExitSuccess) => {
				if ((displaywidth <= 0) || (displayheight <= 0)) {
					this.isShowUrlAvailable = false;
				}
				else {
					this.displayWidth = displaywidth;
					this.displayHeight = displayheight;
					this.isShowUrlAvailable = true;
				}
				Log.debug (`${this.toString ()} getDisplayInfo xdpyinfo process ended; isExitSuccess=${isExitSuccess} displayWidth=${this.displayWidth} displayHeight=${this.displayHeight} isShowUrlAvailable=${this.isShowUrlAvailable}`);
				resolve ();
			}).catch ((err) => {
				Log.debug (`Error reading display info; err=${err}`);
				this.isShowUrlAvailable = false;
				resolve ();
			});
		}));
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
		this.getDisplayInfoTask.stop ();
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
			screenshotPath: (this.screenshotTime > 0) ? SCREENSHOT_PATH : "",
			screenshotTime: this.screenshotTime,
			isPlaying: this.isPlaying,
			isPlayPaused: this.isPlayPaused,
			mediaName: this.isPlaying ? this.playMediaName : "",
			isShowUrlAvailable: this.isShowUrlAvailable,
			isShowingUrl: this.isShowingUrl,
			showUrl: this.isShowingUrl ? this.browserUrl : ""
		};

		intents = App.systemAgent.findIntents (this.name, true);
		if (intents.length > 0) {
			params.intentName = intents[0].displayName;
		}

		return (this.createCommand ("MonitorServerStatus", SystemInterface.Constant.Monitor, params));
	}

	// Return a boolean value indicating if the provided AgentStatus command contains subclass-specific fields indicating a server status change
	doFindStatusChange (agentStatus) {
		let fields, result;

		fields = agentStatus.params.monitorServerStatus;
		if (fields == null) {
			return (false);
		}

		result = false;
		if (this.lastStatus != null) {
			result = (fields.screenshotTime !== this.lastStatus.screenshotTime) ||
				(fields.isPlaying !== this.lastStatus.isPlaying) ||
				(fields.isPlayPaused !== this.lastStatus.isPlayPaused) ||
				(fields.mediaName !== this.lastStatus.mediaName) ||
				(fields.isShowingUrl !== this.lastStatus.isShowingUrl) ||
				(fields.showUrl !== this.lastStatus.showUrl) ||
				(fields.intentName !== this.lastStatus.intentName);
		}
		this.lastStatus = fields;

		return (result);
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
		let proc, item, playparams, playcmd, playid, clearComplete, activateDesktopBlankComplete, fetchThumbnailComplete;

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
			this.runPlayerProcess (cmdInv.params.streamUrl);
			if ((typeof cmdInv.params.thumbnailUrl == "string") && (cmdInv.params.thumbnailUrl != "")) {
				App.systemAgent.fetchUrlFile (cmdInv.params.thumbnailUrl, App.DATA_DIRECTORY, SCREENSHOT_FILENAME, fetchThumbnailComplete);
			}
		};
		fetchThumbnailComplete = (err, destFilename) => {
			if (err != null) {
				Log.debug (`${this.toString ()} failed to load stream thumbnail image; err=${err}`);
				return;
			}
			this.screenshotTime = new Date ().getTime ();
		};

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Execute a PauseMedia command and return a result command
	pauseMedia (cmdInv) {
		let intents;

		this.isPlayPaused = (! this.isPlayPaused);
		if (this.playProcess != null) {
			this.playProcess.write ("p");
		}

		intents = App.systemAgent.findIntents (this.name, true);
		for (let intent of intents) {
			if (intent.name == "MediaDisplayIntent") {
				intent.setPaused (this.isPlayPaused);
			}
		}

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Execute a PlayCacheStream command and return a result command
	playCacheStream (cmdInv) {
		let item, proc, indexpath, indexdata, firstsegment, pct, delta, writeIndexFileComplete, clearComplete, activateDesktopBlankComplete, copyThumbnailComplete;

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
			this.runPlayerProcess (indexpath);
			Fs.copyFile (Path.join (this.cacheDataPath, cmdInv.params.streamId, App.STREAM_THUMBNAIL_PATH, firstsegment + ".jpg"), Path.join (App.DATA_DIRECTORY, SCREENSHOT_FILENAME), copyThumbnailComplete);
		};
		copyThumbnailComplete = (err) => {
			if (err != null) {
				Log.debug (`${this.toString ()} failed to copy stream thumbnail image; err=${err}`);
				return;
			}
			this.screenshotTime = new Date ().getTime ();
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
		let stopPlayerComplete, stopBrowserComplete, endClear;

		this.emitter.once (CLEAR_COMPLETE_EVENT, clearCallback);
		if (this.isClearing) {
			return;
		}
		this.isClearing = true;
		this.runBrowserProcessTask.stop ();
		this.findBrowserProcessTask.stop ();
		this.stopPlayer (() => {
			stopPlayerComplete ();
		});
		stopPlayerComplete = () => {
			this.stopBrowser (stopBrowserComplete);
		};
		stopBrowserComplete = () => {
			endClear ();
		};

		endClear = () => {
			this.isClearing = false;
			this.emitter.emit (CLEAR_COMPLETE_EVENT);
		};
	}

	// Stop any active media player process and invoke the provided callback when complete
	stopPlayer (callback) {
		App.systemAgent.runProcess (KILLALL_PROCESS_NAME, [
			"-q", "omxplayer.bin"
		]).catch ((err) => {
			Log.err (`${this.toString ()} error stopping player process; err=${err}`);
		}).then (() => {
			this.playProcess = null;
			this.isPlaying = false;
			callback ();
		});
	}

	// Stop any active browser process and invoke the provided callback when complete
	stopBrowser (callback) {
		if (! this.isShowingUrl) {
			if (callback != null) {
				process.nextTick (callback);
			}
			return;
		}

		App.systemAgent.runProcess (KILLALL_PROCESS_NAME, [
			"-q", "chromium-browse", "chromium-browser-v7", "chromium-browser"
		]).catch ((err) => {
			Log.err (`${this.toString ()} error stopping browser process; err=${err}`);
		}).then (() => {
			callback ();
		});
	}

	// Execute a ShowWebUrl command and return a result command
	showWebUrl (cmdInv) {
		let clearComplete, deactivateDesktopBlankComplete;

		if (! this.isShowUrlAvailable) {
			return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false
			}));
		}
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
			this.runBrowserProcessTask.setRepeating ((callback) => {
				this.runBrowserProcess (cmdInv.params.url, callback);
			}, RUN_BROWSER_PROCESS_PERIOD);
		};

		return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Run a browser process if one is not already running, and invoke the provided callback when complete
	runBrowserProcess (url, callback) {
		let proc;

		if (this.xDisplay == "") {
			this.runBrowserProcessTask.stop ();
			process.nextTick (callback);
			return;
		}

		Log.debug (`${this.toString ()} run browser; url=${url}`);
		this.findBrowserProcess (() => {
			if (this.isShowingUrl) {
				callback ();
				return;
			}

			this.isShowingUrl = true;
			this.browserUrl = url;
			proc = new ExecProcess (CHROMIUM_PROCESS_NAME, [
				"--kiosk",
				"--user-data-dir=/tmp",
				url
			], {
				"DISPLAY": this.xDisplay
			}, "", (lines, parseCallback) => {
				for (let line of lines) {
					Log.debug3 (`${this.toString ()} browser output: ${line}`);
				}
				process.nextTick (parseCallback);
			}, (err, isExitSuccess) => {
				Log.debug3 (`${this.toString ()} browser end; err=${err} isExitSuccess=${isExitSuccess}`);
				if (proc == this.browserProcess) {
					this.browserProcess = null;
					this.isShowingUrl = false;
				}
				this.findBrowserProcessTask.setNextRepeat (0);
			});
			this.browserProcess = proc;

			if ((this.displayWidth > 0) && (this.displayHeight > 0)) {
				App.systemAgent.runProcess (XDOTOOL_PROCESS_NAME, [ "mousemove", this.displayWidth, 0 ], { "DISPLAY": this.xDisplay }).then ((isExitSuccess) => {
				}).catch ((err) => {
					Log.err (`${this.toString ()} failed to run xdotool; err=${err}`);
				});
			}

			this.runBrowserProcessTask.stop ();
			this.findBrowserProcessTask.setRepeating ((callback) => {
				this.findBrowserProcess (callback);
			}, FIND_BROWSER_PROCESS_PERIOD);
			callback ();
		});
	}

	// Check if a browser process is running, update the isShowingUrl data member, and invoke the provided callback when complete
	findBrowserProcess (callback) {
		let found, procDataCallback;

		found = false;
		procDataCallback = (lines, parseCallback) => {
			if (! found) {
				for (let line of lines) {
					if (line.indexOf ("<defunct>") < 0) {
						found = true;
						break;
					}
				}
			}
			process.nextTick (parseCallback);
		};

		App.systemAgent.runProcess (PS_PROCESS_NAME, [
			"--no-headers",
			"-C", "chromium-browse,chromium-browser-v7,chromium-browser"
		], { }, "", procDataCallback).then ((isExitSuccess) => {
			this.isShowingUrl = found;
			if (! found) {
				this.browserUrl = "";
				this.findBrowserProcessTask.stop ();
			}
		}).catch ((err) => {
			Log.err (`${this.toString ()} error finding browser process; err=${err}`);
		}).then (() => {
			callback ();
		});
	}

	// Run a media player process
	runPlayerProcess (targetMedia) {
		let proc, intents;

		Log.debug (`${this.toString ()} run media player; targetMedia=${targetMedia}`);
		proc = new ExecProcess (OMXPLAYER_PROCESS_NAME, [ "--no-osd", targetMedia ], { }, "", (lines, parseCallback) => {
			for (let line of lines) {
				Log.debug3 (`${this.toString ()} player output: ${line}`);
			}
			process.nextTick (parseCallback);
		}, (err, isExitSuccess) => {
			Log.debug3 (`${this.toString ()} player end; err=${err} isExitSuccess=${isExitSuccess}`);
			if (proc == this.playProcess) {
				this.playProcess = null;
				this.isPlaying = false;
			}
		});
		this.playProcess = proc;
		this.isPlayPaused = false;
		intents = App.systemAgent.findIntents (this.name, true);
		for (let intent of intents) {
			if (intent.name == "MediaDisplayIntent") {
				intent.setPaused (false);
			}
		}
	}

	// Deactivate and disable desktop screen blank functionality and invoke the provided callback when complete
	deactivateDesktopBlank (endCallback) {
		if (this.xDisplay == "") {
			process.nextTick (endCallback);
			return;
		}

		App.systemAgent.runProcess (XSET_PROCESS_NAME, [ "s", "off" ], { "DISPLAY": this.xDisplay }).then ((isExitSuccess) => {
			return (App.systemAgent.runProcess (XSET_PROCESS_NAME, [ "-dpms" ], { "DISPLAY": this.xDisplay }));
		}).then ((isExitSuccess) => {
			return (App.systemAgent.runProcess (XSET_PROCESS_NAME, [ "s", "noblank" ], { "DISPLAY": this.xDisplay }));
		}).catch ((err) => {
			Log.err (`${this.toString ()} error deactivating desktop blank; err=${err}`);
		}).then (() => {
			endCallback ();
		});
	}

	// Activate the desktop screen blank and invoke the provided callback when complete
	activateDesktopBlank (endCallback) {
		if (this.xDisplay == "") {
			process.nextTick (endCallback);
			return;
		}

		App.systemAgent.runProcess (XSET_PROCESS_NAME, [ "s", "activate" ], { "DISPLAY": this.xDisplay }).catch ((err) => {
			Log.err (`${this.toString ()} error activating desktop blank; err=${err}`);
		}).then (() => {
			endCallback ();
		});
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
			params.success = true;
			this.clear (() => {
				App.systemAgent.runIntent (intent, this.name);
			});
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
			params.success = true;
			this.clear (() => {
				App.systemAgent.runIntent (intent, this.name);
			});
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
			return (this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false
			}));
		}

		removepath = Path.join (this.cacheDataPath, cmdInv.params.id);
		delete (this.streamMap[cmdInv.params.id]);
		delete (this.streamSourceMap[item.params.sourceId]);

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
			App.systemAgent.endRequest (request, response, 404, "Not found");
			return;
		}

		if (cmdInv.params.thumbnailIndex >= item.params.segmentCount) {
			App.systemAgent.endRequest (request, response, 404, "Not found");
			return;
		}

		path = Path.join (this.cacheDataPath, cmdInv.params.id, App.STREAM_THUMBNAIL_PATH, cmdInv.params.thumbnailIndex + ".jpg");
		App.systemAgent.writeFileResponse (request, response, path, "image/jpeg");
	}

	// Update the monitor's screenshot image to reflect display state and invoke the provided callback when complete
	captureScreenshot (endCallback) {
		let now, targetpath;
		if ((this.xDisplay == "") || this.isPlaying) {
			process.nextTick (endCallback);
			return;
		}

		now = new Date ().getTime ();
		targetpath = Path.join (App.DATA_DIRECTORY, `screenshot_${now}.jpg`);
		App.systemAgent.runProcess (SCROT_PROCESS_NAME,
			[ targetpath, "-z", "-q", "90" ],
			{ "DISPLAY": this.xDisplay }
		).then (() => {
			return (FsUtil.renameFile (targetpath, Path.join (App.DATA_DIRECTORY, SCREENSHOT_FILENAME)));
		}).then (() => {
			this.screenshotTime = now;
		}).catch ((err) => {
			Log.err (`Failed to capture display screenshot; err=${err}`);
			Fs.unlink (targetpath, () => { });
		}).then (() => {
			endCallback ();
		});
	}
}
module.exports = MonitorServer;
