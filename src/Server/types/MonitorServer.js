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
const Log = require (Path.join (App.SOURCE_DIRECTORY, "Log"));
const SystemInterface = require (Path.join (App.SOURCE_DIRECTORY, "SystemInterface"));
const StringUtil = require (Path.join (App.SOURCE_DIRECTORY, "StringUtil"));
const FsUtil = require (Path.join (App.SOURCE_DIRECTORY, "FsUtil"));
const ExecProcess = require (Path.join (App.SOURCE_DIRECTORY, "ExecProcess"));
const RepeatTask = require (Path.join (App.SOURCE_DIRECTORY, "RepeatTask"));
const Intent = require (Path.join (App.SOURCE_DIRECTORY, "Intent", "Intent"));
const Task = require (Path.join (App.SOURCE_DIRECTORY, "Task", "Task"));
const ServerBase = require (Path.join (App.SOURCE_DIRECTORY, "Server", "ServerBase"));

const ThumbnailPath = "/mon/a.jpg";
const ScreenshotPath = "/mon/b.jpg";
const ScreenshotFilename = "screenshot.jpg";
const CameraScreenshotFilename = "camera_stream_screenshot.jpg";
const RunlevelProcessName = "/sbin/runlevel";
const XsetProcessName = "/usr/bin/xset";
const PsProcessName = "/bin/ps";
const KillallProcessName = "/usr/bin/killall";
const ChromiumProcessName = "/usr/bin/chromium-browser";
const OmxplayerProcessName = "/usr/bin/omxplayer";
const ScrotProcessName = "/usr/bin/scrot";
const XdpyinfoProcessName = "/usr/bin/xdpyinfo";
const XdotoolProcessName = "/usr/bin/xdotool";
const GetDisplayInfoPeriod = 27500; // milliseconds
const RunBrowserProcessPeriod = 1000; // milliseconds
const FindBrowserProcessPeriod = 15000; // milliseconds
const GetDiskSpacePeriod = 15 * 60 * 1000; // milliseconds
const ClearCompleteEvent = "clearComplete";
const ImageFilenamePrefix = "img_";

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
		this.surfaceProcess = null;
		this.showImageName = "";
		this.displayMode = SystemInterface.Constant.DefaultDisplayState;
		this.findBrowserProcessTask = new RepeatTask ();
		this.runBrowserProcessTask = new RepeatTask ();
		this.getDisplayInfoTask = new RepeatTask ();
		this.totalStorage = 0; // bytes
		this.freeStorage = 0; // bytes
		this.usedStorage = 0; // bytes
		this.getDiskSpaceTask = new RepeatTask ();
		this.cacheDataPath = Path.join (App.DATA_DIRECTORY, App.StreamCachePath);

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
			App.systemAgent.addInvokeRequestHandler (SystemInterface.Constant.DefaultInvokePath, SystemInterface.Constant.Monitor, (cmdInv, request, response) => {
				switch (cmdInv.command) {
					case SystemInterface.CommandId.ClearDisplay: {
						this.clearDisplay (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.PlayMedia: {
						this.playMedia (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.PauseMedia: {
						this.pauseMedia (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.PlayCacheStream: {
						this.playCacheStream (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.CreateCacheStream: {
						this.createCacheStream (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.RemoveStream: {
						this.removeStream (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.ClearCache: {
						this.clearCache (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.ShowWebUrl: {
						this.showWebUrl (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.ShowCameraImage: {
						this.showCameraImage (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.PlayCameraStream: {
						this.playCameraStream (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.CreateWebDisplayIntent: {
						this.createWebDisplayIntent (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.CreateMediaDisplayIntent: {
						this.createMediaDisplayIntent (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.CreateStreamCacheDisplayIntent: {
						this.createStreamCacheDisplayIntent (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.CreateCameraDisplayIntent: {
						this.createCameraDisplayIntent (cmdInv, request, response);
						break;
					}
					case SystemInterface.CommandId.CreateMonitorProgram: {
						this.createMonitorProgram (cmdInv, request, response);
						break;
					}
					default: {
						App.systemAgent.writeResponse (request, response, 400);
						break;
					}
				}
			});

			App.systemAgent.addLinkCommandHandler (SystemInterface.Constant.Monitor, (cmdInv, client) => {
				switch (cmdInv.command) {
					case SystemInterface.CommandId.FindItems: {
						this.findItems (cmdInv, client);
						break;
					}
				}
			});

			App.systemAgent.addSecondaryRequestHandler (ThumbnailPath, (cmdInv, request, response) => {
				switch (cmdInv.command) {
					case SystemInterface.CommandId.GetThumbnailImage: {
						this.getThumbnailImage (cmdInv, request, response);
						break;
					}
					default: {
						App.systemAgent.writeResponse (request, response, 400);
						break;
					}
				}
			});

			App.systemAgent.addSecondaryRequestHandler (ScreenshotPath, (cmdInv, request, response) => {
				if (this.screenshotTime <= 0) {
					App.systemAgent.writeResponse (request, response, 404);
					return;
				}

				const path = Path.join (App.DATA_DIRECTORY, ScreenshotFilename);
				App.systemAgent.writeFileResponse (request, response, path, "image/jpeg");
			});

			if (this.xDisplay != "") {
				this.getDisplayInfoTask.setRepeating ((callback) => {
					this.getDisplayInfo ().catch ((err) => {
						// Do nothing
					}).then (() => {
						callback ();
					});
				}, GetDisplayInfoPeriod);
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
			}, GetDiskSpacePeriod);

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
			let runlevel;

			runlevel = "";
			const task = new RepeatTask ();
			task.setRepeating ((callback) => {
				App.systemAgent.runProcess (RunlevelProcessName, [ ], { }, "", (lines, parseCallback) => {
					if (runlevel == "") {
						for (const line of lines) {
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
			}, App.HeartbeatPeriod * 4);
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

			displaywidth = 0;
			displayheight = 0;
			App.systemAgent.runProcess (XdpyinfoProcessName, [ ], { "DISPLAY": this.xDisplay }, "", (lines, parseCallback) => {
				for (const line of lines) {
					const m = line.match (/dimensions:.*?([0-9]+)x([0-9]+)[^0-9]/);
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
					if ((displaywidth != this.displayWidth) || (displayheight != this.displayHeight)) {
						Log.debug (`${this.toString ()} xDisplay=${this.xDisplay} displayWidth=${displaywidth} displayHeight=${displayheight}`);
					}
					this.displayWidth = displaywidth;
					this.displayHeight = displayheight;
					this.isShowUrlAvailable = true;
				}
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
			let idindex, streampath, streamrecord;

			const ids = [ ];
			streamrecord = null;
			setTimeout (() => {
				FsUtil.readDirectory (this.cacheDataPath, readDirectoryComplete);
			}, 0);

			const readDirectoryComplete = (err, files) => {
				if (err != null) {
					reject (err);
					return;
				}

				for (const file of files) {
					if (App.systemAgent.getUuidCommand (file) == SystemInterface.CommandId.StreamItem) {
						ids.push (file);
					}
				}

				idindex = -1;
				readNextStream ();
			};

			const readNextStream = () => {
				++idindex;
				if (idindex >= ids.length) {
					resolve ();
					return;
				}

				streampath = Path.join (this.cacheDataPath, ids[idindex]);
				Fs.readFile (Path.join (streampath, App.StreamRecordFilename), readRecordFileComplete);
			};

			const readRecordFileComplete = (err, data) => {
				if (err != null) {
					removeStreamDirectory ();
					return;
				}

				streamrecord = SystemInterface.parseCommand (data.toString ());
				if ((streamrecord == null) || (streamrecord.command != SystemInterface.CommandId.StreamItem))  {
					removeStreamDirectory ();
					return;
				}

				const filenames = [ ];
				for (let i = 0; i < streamrecord.params.segmentCount; ++i) {
					filenames.push (Path.join (streampath, App.StreamHlsPath, `${i}.ts`));
					filenames.push (Path.join (streampath, App.StreamThumbnailPath, `${i}.jpg`));
				}
				FsUtil.statFiles (filenames, (filename, stats) => {
					return (stats.isFile () && (stats.size > 0));
				}, statFilesComplete);
			};

			const statFilesComplete = (err) => {
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

			const removeStreamDirectory = () => {
				Log.warn (`${this.toString ()} Invalid stream cache entry, deleted; path=${streampath}`);
				FsUtil.removeDirectory (streampath, readNextStream);
			};
		}));
	}

	// Execute subclass-specific stop operations and invoke the provided callback when complete
	doStop (stopCallback) {
		this.getDiskSpaceTask.stop ();
		this.getDisplayInfoTask.stop ();
		this.screenshotTask.stop ();
		this.clear (stopCallback);
	}

	// Return a command invocation containing the server's status
	doGetStatus (cmdInv) {
		const params = {
			freeStorage: this.freeStorage,
			totalStorage: this.totalStorage,
			streamCount: Object.keys (this.streamMap).length,
			thumbnailPath: ThumbnailPath,
			screenshotPath: (this.screenshotTime > 0) ? ScreenshotPath : "",
			screenshotTime: this.screenshotTime,
			isPlayPaused: this.isPlayPaused,
			isShowUrlAvailable: this.isShowUrlAvailable,
			displayState: SystemInterface.Constant.DefaultDisplayState
		};

		switch (this.displayMode) {
			case SystemInterface.Constant.ShowUrlDisplayState: {
				if (this.isShowingUrl) {
					params.displayState = this.displayMode;
					params.displayTarget = this.browserUrl;
				}
				break;
			}
			case SystemInterface.Constant.PlayMediaDisplayState:
			case SystemInterface.Constant.PlayCameraStreamDisplayState: {
				if (this.isPlaying) {
					params.displayState = this.displayMode;
					params.displayTarget = this.playMediaName;
				}
				break;
			}
			case SystemInterface.Constant.ShowImageDisplayState: {
				if (this.surfaceProcess != null) {
					params.displayState = this.displayMode;
					params.displayTarget = this.showImageName;
				}
				break;
			}
		}

		const intents = App.systemAgent.findIntents (this.name, true);
		for (const intent of intents) {
			if (intent.isDisplayConditionActive) {
				params.intentName = intent.displayName;
				break;
			}
		}

		return (this.createCommand ("MonitorServerStatus", SystemInterface.Constant.Monitor, params));
	}

	// Return a boolean value indicating if the provided AgentStatus command contains subclass-specific fields indicating a server status change
	doFindStatusChange (agentStatus) {
		let result;

		const fields = agentStatus.params.monitorServerStatus;
		if (fields == null) {
			return (false);
		}

		result = false;
		if (this.lastStatus != null) {
			result = (fields.screenshotTime !== this.lastStatus.screenshotTime) ||
				(fields.isPlayPaused !== this.lastStatus.isPlayPaused) ||
				(fields.intentName !== this.lastStatus.intentName) ||
				(fields.displayState !== this.lastStatus.displayState) ||
				(fields.displayTarget !== this.lastStatus.displayTarget);
		}
		this.lastStatus = fields;

		return (result);
	}

	// Clear the display of all active processes
	clearDisplay (cmdInv, request, response) {
		App.systemAgent.removeIntentGroup (this.name);
		this.clear (() => { });
		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Play a media item
	playMedia (cmdInv, request, response) {
		let item, playparams, playcmd, playid;

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
					this.playCacheStream (playcmd, request, response);
					return;
				}
			}
		}

		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}

		this.displayMode = SystemInterface.Constant.PlayMediaDisplayState;
		this.clear (() => {
			this.playMediaName = cmdInv.params.mediaName;
			this.isPlaying = true;
			this.activateDesktopBlank (activateDesktopBlankComplete);
		});
		const activateDesktopBlankComplete = () => {
			this.runPlayerProcess (cmdInv.params.streamUrl);
			if ((typeof cmdInv.params.thumbnailUrl == "string") && (cmdInv.params.thumbnailUrl != "")) {
				App.systemAgent.fetchUrlFile (cmdInv.params.thumbnailUrl, App.DATA_DIRECTORY, ScreenshotFilename, fetchThumbnailComplete);
			}
		};
		const fetchThumbnailComplete = (err, destFilename) => {
			if (err != null) {
				Log.debug (`${this.toString ()} failed to load stream thumbnail image; err=${err}`);
				return;
			}
			this.screenshotTime = Date.now ();
		};

		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Pause or resume any running playback process
	pauseMedia (cmdInv, request, response) {
		this.isPlayPaused = (! this.isPlayPaused);
		if (this.playProcess != null) {
			this.playProcess.write ("p");
		}

		const intents = App.systemAgent.findIntents (this.name, true);
		for (const intent of intents) {
			if (intent.isDisplayConditionActive) {
				if ((intent.name == "MediaDisplayIntent") || (intent.name == "StreamCacheDisplayIntent")) {
					intent.setPaused (this.isPlayPaused);
				}
			}
		}

		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Play a media item from the stream cache
	playCacheStream (cmdInv, request, response) {
		let indexpath, indexdata, firstsegment, pct, delta;

		const item = this.streamMap[cmdInv.params.streamId];
		if (item == null) {
			App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false,
				error: "Stream not found"
			}));
			return;
		}

		if (App.systemAgent.memoryFilePath != "") {
			indexpath = Path.join (App.systemAgent.memoryFilePath, App.StreamHlsIndexFilename);
		}
		else {
			indexpath = Path.join (this.cacheDataPath, App.StreamHlsIndexFilename);
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
			indexdata += `#EXT-X-TARGETDURATION:${item.params.hlsTargetDuration}\n`;
		}
		else {
			indexdata += "#EXT-X-TARGETDURATION:5\n";
		}
		for (let i = firstsegment; i < item.params.segmentCount; ++i) {
			indexdata += `#EXTINF:${item.params.segmentLengths[i]},\n`;
			indexdata += Path.join (this.cacheDataPath, item.params.id, App.StreamHlsPath, item.params.segmentFilenames[i]);
			indexdata += "\n";
		}
		indexdata += "#EXT-X-ENDLIST\n";

		this.displayMode = SystemInterface.Constant.PlayMediaDisplayState;
		Fs.writeFile (indexpath, indexdata, { }, (err) => {
			if (err != null) {
				Log.debug (`${this.toString ()} failed to play cache stream; err=${err}`);
				return;
			}

			if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
				App.systemAgent.removeIntentGroup (this.name);
			}
			this.clear (clearComplete);
		});
		const clearComplete = () => {
			this.playMediaName = item.params.name;
			this.isPlaying = true;
			this.activateDesktopBlank (activateDesktopBlankComplete);
		};
		const activateDesktopBlankComplete = () => {
			this.runPlayerProcess (indexpath);
			Fs.copyFile (Path.join (this.cacheDataPath, cmdInv.params.streamId, App.StreamThumbnailPath, `${firstsegment}.jpg`), Path.join (App.DATA_DIRECTORY, ScreenshotFilename), copyThumbnailComplete);
		};
		const copyThumbnailComplete = (err) => {
			if (err != null) {
				Log.debug (`${this.toString ()} failed to copy stream thumbnail image; err=${err}`);
				return;
			}
			this.screenshotTime = Date.now ();
		};

		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Delete all stored cache items
	clearCache (cmdInv, request, response) {
		App.systemAgent.removeIntentGroup (this.name);
		setTimeout (() => {
			this.clear (clearComplete);
		}, 0);
		const clearComplete = () => {
			this.streamMap = { };
			this.streamSourceMap = { };
			FsUtil.removeDirectory (this.cacheDataPath, removeDirectoryComplete);
		};
		const removeDirectoryComplete = (err) => {
			if (err != null) {
				Log.warn (`Failed to remove cache files; path=${this.cacheDataPath} err=${err}`);
				return;
			}

			FsUtil.createDirectory (this.cacheDataPath, createDirectoryComplete);
		};
		const createDirectoryComplete = (err) => {
			if (err != null) {
				Log.warn (`Failed to create cache data directory; path=${this.cacheDataPath} err=${err}`);
			}
			this.getDiskSpaceTask.setNextRepeat (0);
		};

		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Stop all running display processes
	clear (clearCallback) {
		this.emitter.once (ClearCompleteEvent, clearCallback);
		if (this.isClearing) {
			return;
		}

		this.isClearing = true;
		this.runBrowserProcessTask.stop ();
		this.findBrowserProcessTask.stop ();
		this.stopPlayer (() => {
			stopPlayerComplete ();
		});
		const stopPlayerComplete = () => {
			this.stopBrowser (stopBrowserComplete);
		};
		const stopBrowserComplete = () => {
			this.stopSurface (stopSurfaceComplete);
		};
		const stopSurfaceComplete = () => {
			endClear ();
		};
		const endClear = () => {
			this.isClearing = false;
			this.isPlayPaused = false;
			this.emitter.emit (ClearCompleteEvent);
		};
	}

	// Stop any active media player process and invoke the provided callback when complete
	stopPlayer (callback) {
		App.systemAgent.runProcess (KillallProcessName, [
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

		App.systemAgent.runProcess (KillallProcessName, [
			"-q", "chromium-browse", "chromium-browser-v7", "chromium-browser"
		]).catch ((err) => {
			Log.err (`${this.toString ()} error stopping browser process; err=${err}`);
		}).then (() => {
			callback ();
		});
	}

	// Stop any active surface process and invoke the provided callback when complete
	stopSurface (callback) {
		if (this.surfaceProcess != null) {
			this.surfaceProcess.stop ();
			this.surfaceProcess = null;
		}
		process.nextTick (callback);
	}

	// Launch a browser to show a web URL
	showWebUrl (cmdInv, request, response) {
		if (! this.isShowUrlAvailable) {
			App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false
			}));
			return;
		}

		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}

		this.displayMode = SystemInterface.Constant.ShowUrlDisplayState;
		this.clear (() => {
			this.deactivateDesktopBlank (deactivateDesktopBlankComplete);
		});
		const deactivateDesktopBlankComplete = () => {
			this.runBrowserProcessTask.setRepeating ((callback) => {
				this.runBrowserProcess (cmdInv.params.url, callback);
			}, RunBrowserProcessPeriod);
		};

		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Load and display a timelapse image from a camera agent
	showCameraImage (cmdInv, request, response) {
		let camerastatus;

		this.clearImageCache ().then (() => {
			return (App.systemAgent.agentControl.invokeHostCommand (cmdInv.params.host, SystemInterface.Constant.DefaultInvokePath, this.createCommand ("GetStatus"), SystemInterface.CommandId.AgentStatus));
		}).then ((responseCommand) => {
			if (responseCommand.params.cameraServerStatus == null) {
				return (Promise.reject (Error ("Host provided no camera server status")));
			}

			camerastatus = responseCommand;
			return (this.getImageCacheFilename ("jpg"));
		}).then ((filename) => {
			const cmd = this.createCommand ("GetCaptureImage", SystemInterface.Constant.Camera, {
				imageTime: cmdInv.params.imageTime
			});
			if (cmd == null) {
				return (Promise.reject (Error ("Failed to create GetCaptureImage command")));
			}

			return (App.systemAgent.fetchUrlFile (`http:${App.DoubleSlash}${StringUtil.parseAddressHostname (cmdInv.params.host.hostname)}:${camerastatus.params.tcpPort2}${camerastatus.params.cameraServerStatus.captureImagePath}?${SystemInterface.Constant.UrlQueryParameter}=${encodeURIComponent (JSON.stringify (cmd))}`, App.DATA_DIRECTORY, filename));
		}).then ((urlFile) => {
			Log.debug (`${this.toString ()} ShowCameraImage saved image data; path=${urlFile}`);
			App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: true
			}));

			Fs.copyFile (urlFile, Path.join (App.DATA_DIRECTORY, ScreenshotFilename), (err) => {
				if (err != null) {
					Log.debug (`${this.toString ()} failed to copy camera thumbnail image; err=${err}`);
					return;
				}
				this.screenshotTime = Date.now ();
			});

			if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
				App.systemAgent.removeIntentGroup (this.name);
			}
			this.displayMode = SystemInterface.Constant.ShowImageDisplayState;
			this.showImageName = cmdInv.params.host.hostname;
			if (this.surfaceProcess != null) {
				this.surfaceProcess.write (JSON.stringify (this.createCommand ("ShowFileImageBackground", SystemInterface.Constant.DefaultCommandType, {
					imagePath: urlFile
				})));
				return;
			}

			this.clear (() => {
				this.activateDesktopBlank (activateDesktopBlankComplete);
			});
			const activateDesktopBlankComplete = () => {
				this.runSurfaceProcess ();
				if (this.surfaceProcess != null) {
					this.surfaceProcess.write (JSON.stringify (this.createCommand ("ShowFileImageBackground", SystemInterface.Constant.DefaultCommandType, {
						imagePath: urlFile
					})));
				}
			};
		}).catch ((err) => {
			Log.debug (`${this.toString ()} failed to execute ShowCameraImage command; err=${err}`);
			App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false
			}));
		});
	}

	// Play a live stream from a camera agent
	playCameraStream (cmdInv, request, response) {
		let streamurl;

		const cmd = this.createCommand ("GetCameraStream", SystemInterface.Constant.Camera, {
			monitorName: App.systemAgent.displayName
		});
		if (cmd == null) {
			App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false
			}));
			return;
		}

		streamurl = "";
		App.systemAgent.agentControl.invokeHostCommand (cmdInv.params.host, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.GetCameraStreamResult).then ((responseCommand) => {
			streamurl = responseCommand.params.streamUrl;
			doPlay ();
			App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: true
			}));
		}).catch ((err) => {
			Log.debug (`${this.toString ()} failed to execute PlayCameraStream command; err=${err}`);
			App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false
			}));
		});

		const doPlay = () => {
			if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
				App.systemAgent.removeIntentGroup (this.name);
			}
			this.displayMode = SystemInterface.Constant.PlayCameraStreamDisplayState;
			this.clear (clearComplete);
		};
		const clearComplete = () => {
			this.playMediaName = cmdInv.params.host.hostname;
			this.isPlaying = true;
			this.activateDesktopBlank (activateDesktopBlankComplete);
		};
		const activateDesktopBlankComplete = () => {
			Fs.copyFile (Path.join (App.BIN_DIRECTORY, CameraScreenshotFilename), Path.join (App.DATA_DIRECTORY, ScreenshotFilename), (err) => {
				if (err != null) {
					Log.debug (`${this.toString ()} failed to copy camera screenshot image; err=${err}`);
					return;
				}
				this.screenshotTime = Date.now ();
			});

			this.runPlayerProcess (streamurl);
		};
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
			proc = new ExecProcess (ChromiumProcessName, [
				"--kiosk",
				"--user-data-dir=/tmp",
				url
			], {
				"DISPLAY": this.xDisplay
			}, "", (lines, parseCallback) => {
				for (const line of lines) {
					Log.debug4 (`${this.toString ()} browser output: ${line}`);
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
				App.systemAgent.runProcess (XdotoolProcessName, [ "mousemove", this.displayWidth, 0 ], { "DISPLAY": this.xDisplay }).then ((isExitSuccess) => {
				}).catch ((err) => {
					Log.err (`${this.toString ()} failed to run xdotool; err=${err}`);
				});
			}

			this.runBrowserProcessTask.stop ();
			this.findBrowserProcessTask.setRepeating ((callback) => {
				this.findBrowserProcess (callback);
			}, FindBrowserProcessPeriod);
			callback ();
		});
	}

	// Check if a browser process is running, update the isShowingUrl data member, and invoke the provided callback when complete
	findBrowserProcess (callback) {
		let found;

		found = false;
		const procDataCallback = (lines, parseCallback) => {
			if (! found) {
				for (const line of lines) {
					if (line.indexOf ("<defunct>") < 0) {
						found = true;
						break;
					}
				}
			}
			process.nextTick (parseCallback);
		};

		App.systemAgent.runProcess (PsProcessName, [
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
	runPlayerProcess (targetMedia, playerArgs) {
		const args = Array.isArray (playerArgs) ? playerArgs : [ ];
		args.push ("--no-osd");
		args.push (targetMedia);
		Log.debug (`${this.toString ()} run media player; args=${JSON.stringify (args)}`);
		const proc = new ExecProcess (OmxplayerProcessName, args, { }, "", (lines, parseCallback) => {
			for (const line of lines) {
				Log.debug4 (`${this.toString ()} player output: ${line}`);
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
		const intents = App.systemAgent.findIntents (this.name, true);
		for (const intent of intents) {
			if ((intent.name == "MediaDisplayIntent") || (intent.name == "StreamCacheDisplayIntent")) {
				intent.setPaused (false);
			}
		}
	}

	// Run a display surface process
	runSurfaceProcess () {
		Log.debug (`${this.toString ()} run surface`);
		const proc = new ExecProcess (Path.join (App.BIN_DIRECTORY, "membrane-surface", "membrane-surface"), [ ], {
			"RESOURCE_PATH": Path.join (App.BIN_DIRECTORY, "membrane-surface", "membrane-surface.dat"),
			"LD_LIBRARY_PATH": Path.join (App.BIN_DIRECTORY, "membrane-surface")
		}, "", (lines, parseCallback) => {
			for (const line of lines) {
				Log.debug4 (`${this.toString ()} surface output: ${line}`);
			}
			process.nextTick (parseCallback);
		}, (err, isExitSuccess) => {
			Log.debug3 (`${this.toString ()} surface end; err=${err} isExitSuccess=${isExitSuccess}`);
			if (proc == this.surfaceProcess) {
				this.surfaceProcess = null;
			}
		});
		this.surfaceProcess = proc;
		this.isPlayPaused = false;
	}

	// Deactivate and disable desktop screen blank functionality and invoke the provided callback when complete
	deactivateDesktopBlank (endCallback) {
		if (this.xDisplay == "") {
			process.nextTick (endCallback);
			return;
		}

		App.systemAgent.runProcess (XsetProcessName, [ "s", "off" ], { "DISPLAY": this.xDisplay }).then ((isExitSuccess) => {
			return (App.systemAgent.runProcess (XsetProcessName, [ "-dpms" ], { "DISPLAY": this.xDisplay }));
		}).then ((isExitSuccess) => {
			return (App.systemAgent.runProcess (XsetProcessName, [ "s", "noblank" ], { "DISPLAY": this.xDisplay }));
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

		App.systemAgent.runProcess (XsetProcessName, [ "s", "activate" ], { "DISPLAY": this.xDisplay }).catch ((err) => {
			Log.err (`${this.toString ()} error activating desktop blank; err=${err}`);
		}).then (() => {
			endCallback ();
		});
	}

	// Start an intent to show a web content playlist
	createWebDisplayIntent (cmdInv, request, response) {
		const params = {
			success: false,
			error: ""
		};
		const intent = Intent.createIntent ("WebDisplayIntent", cmdInv.params);
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

		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, params));
	}

	// Start an intent to show a media content playlist
	createMediaDisplayIntent (cmdInv, request, response) {
		const params = {
			success: false,
			error: ""
		};
		const intent = Intent.createIntent ("MediaDisplayIntent", cmdInv.params);
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
		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, params));
	}

	// Start an intent to show cached streams
	createStreamCacheDisplayIntent (cmdInv, request, response) {
		const params = {
			success: false,
			error: ""
		};
		const intent = Intent.createIntent ("StreamCacheDisplayIntent", cmdInv.params);
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
		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, params));
	}

	// Start an intent to show images from camera agents
	createCameraDisplayIntent (cmdInv, request, response) {
		const params = {
			success: false,
			error: ""
		};
		const intent = Intent.createIntent ("CameraDisplayIntent", cmdInv.params);
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
		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, params));
	}

	// Start a program to show monitor content chosen from among multiple sources
	createMonitorProgram (cmdInv, request, response) {
		let item;

		const params = {
			success: true,
			error: ""
		};
		const intents = [ ];
		for (const directive of cmdInv.params.directives) {
			item = null;
			if (directive.webDisplayIntent !== undefined) {
				item = Intent.createIntent ("WebDisplayIntent", directive.webDisplayIntent);
			}
			else if (directive.mediaDisplayIntent !== undefined) {
				item = Intent.createIntent ("MediaDisplayIntent", directive.mediaDisplayIntent);
			}
			else if (directive.streamCacheDisplayIntent !== undefined) {
				item = Intent.createIntent ("StreamCacheDisplayIntent", directive.streamCacheDisplayIntent);
			}

			if (item == null) {
				params.success = false;
				params.error = "Invalid directive";
				break;
			}

			item.conditions = directive.conditions;
			intents.push (item);
		}

		if (params.success) {
			App.systemAgent.removeIntentGroup (this.name);
			this.clear (() => {
				for (const intent of intents) {
					App.systemAgent.runIntent (intent, this.name);
				}
			});
		}
		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, params));
	}

	// Copy data from a media server stream and store it locally
	createCacheStream (cmdInv, request, response) {
		const item = this.streamSourceMap[cmdInv.params.streamId];
		if (item != null) {
			App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: true
			}));
			return;
		}

		const task = Task.createTask ("CacheMediaStream", {
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
			App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false,
				error: "Internal server error"
			}));
			return;
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

		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Delete a previously created stream cache item
	removeStream (cmdInv, request, response) {
		const item = this.streamMap[cmdInv.params.id];
		if (item == null) {
			App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
				success: false
			}));
			return;
		}

		const removepath = Path.join (this.cacheDataPath, cmdInv.params.id);
		delete (this.streamMap[cmdInv.params.id]);
		delete (this.streamSourceMap[item.params.sourceId]);

		FsUtil.removeDirectory (removepath, (err) => {
			if (err != null) {
				Log.warn (`Failed to remove cache stream directory; path=${removepath} err=${err}`);
			}
			this.getDiskSpaceTask.setNextRepeat (0);
		});

		App.systemAgent.writeCommandResponse (request, response, this.createCommand ("CommandResult", SystemInterface.Constant.Monitor, {
			success: true
		}));
	}

	// Find stream cache items and write result commands to the provided client
	findItems (cmdInv, client) {
		// This FindItems handler does not implement search key filters or result offsets
		const cmd = this.createCommand ("FindStreamsResult", SystemInterface.Constant.Monitor, {
			searchKey: "",
			setSize: Object.keys (this.streamMap).length,
			resultOffset: 0
		});
		if (cmd != null) {
			client.emit (SystemInterface.Constant.WebSocketEvent, cmd);
		}
		for (const record of Object.values (this.streamMap)) {
			client.emit (SystemInterface.Constant.WebSocketEvent, record);
		}
	}

	// Write a file response with the specified stream cache thumbnail image
	getThumbnailImage (cmdInv, request, response) {
		const item = this.streamMap[cmdInv.params.id];
		if (item == null) {
			App.systemAgent.writeResponse (request, response, 404);
			return;
		}

		if (cmdInv.params.thumbnailIndex >= item.params.segmentCount) {
			App.systemAgent.writeResponse (request, response, 404);
			return;
		}

		const path = Path.join (this.cacheDataPath, cmdInv.params.id, App.StreamThumbnailPath, `${cmdInv.params.thumbnailIndex}.jpg`);
		App.systemAgent.writeFileResponse (request, response, path, "image/jpeg");
	}

	// Update the monitor's screenshot image to reflect display state and invoke the provided callback when complete
	captureScreenshot (endCallback) {
		if ((this.xDisplay == "") || this.isPlaying || (this.surfaceProcess != null)) {
			process.nextTick (endCallback);
			return;
		}

		const now = Date.now ();
		const targetpath = Path.join (App.DATA_DIRECTORY, `screenshot_${now}.jpg`);
		App.systemAgent.runProcess (ScrotProcessName,
			[ targetpath, "-z", "-q", "90" ],
			{ "DISPLAY": this.xDisplay }
		).then (() => {
			return (FsUtil.renameFile (targetpath, Path.join (App.DATA_DIRECTORY, ScreenshotFilename)));
		}).then (() => {
			this.screenshotTime = now;
		}).catch ((err) => {
			Log.err (`Failed to capture display screenshot; err=${err}`);
			Fs.unlink (targetpath, () => { });
		}).then (() => {
			endCallback ();
		});
	}

	// Return a promise that resolves with the name of a nonexistent file in the image cache
	getImageCacheFilename (extension) {
		return (new Promise ((resolve, reject) => {
			const assignFilename = () => {
				const filename = `${ImageFilenamePrefix}${Date.now ()}_${App.systemAgent.getRandomString (16)}.${extension}`;
				Fs.stat (Path.join (App.DATA_DIRECTORY, filename), (err, stats) => {
					if ((err != null) && (err.code != "ENOENT")) {
						reject (Error (err));
						return;
					}

					if (stats != null) {
						assignFilename ();
						return;
					}

					resolve (filename);
				});
			};
			assignFilename ();
		}));
	}

	clearImageCache () {
		return (new Promise ((resolve, reject) => {
			Fs.readdir (App.DATA_DIRECTORY, (err, files) => {
				const unlinkfiles = [ ];

				if (err != null) {
					reject (Error (err));
					return;
				}

				for (const file of files) {
					if (file.indexOf (ImageFilenamePrefix) == 0) {
						unlinkfiles.push (Path.join (App.DATA_DIRECTORY, file));
					}
				}

				const unlinkNextFile = () => {
					if (unlinkfiles.length <= 0) {
						resolve ();
						return;
					}

					Fs.unlink (unlinkfiles.shift (), (err) => {
						if (err != null) {
							Log.warn (`${this.toString ()} Failed to delete image cache file, ${err}`);
						}
						unlinkNextFile ();
					});
				};
				unlinkNextFile ();
			});
		}));
	}
}
module.exports = MonitorServer;
