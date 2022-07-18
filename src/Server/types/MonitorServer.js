/*
* Copyright 2018-2022 Membrane Software <author@membranesoftware.com> https://membranesoftware.com
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
const WebRequest = require (Path.join (App.SOURCE_DIRECTORY, "WebRequest"));
const RepeatTask = require (Path.join (App.SOURCE_DIRECTORY, "RepeatTask"));
const Intent = require (Path.join (App.SOURCE_DIRECTORY, "Intent", "Intent"));
const TaskGroup = require (Path.join (App.SOURCE_DIRECTORY, "Task", "TaskGroup"));
const ExecuteTask = require (Path.join (App.SOURCE_DIRECTORY, "Task", "ExecuteTask"));
const GetDiskSpaceTask = require (Path.join (App.SOURCE_DIRECTORY, "Task", "GetDiskSpaceTask"));
const CacheMediaStreamTask = require (Path.join (App.SOURCE_DIRECTORY, "Task", "CacheMediaStreamTask"));
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
const VlcProcessName = "/usr/bin/vlc";
const ScrotProcessName = "/usr/bin/scrot";
const XdpyinfoProcessName = "/usr/bin/xdpyinfo";
const XdotoolProcessName = "/usr/bin/xdotool";
const GetDisplayInfoPeriod = 27500; // milliseconds
const RunBrowserProcessPeriod = 1000; // milliseconds
const FindBrowserProcessPeriod = 15000; // milliseconds
const GetDiskSpacePeriod = 15 * 60 * 1000; // milliseconds
const SurfaceEndEvent = "surfaceEnd";
const SurfaceResponseEvent = "surfaceResponse";
const SurfaceResponseWaitPeriod = 5000; // milliseconds
const PlayMediaBlankPeriod = 3500; // milliseconds
const ImageFilenamePrefix = "img_";

const MonitorInvokeCommandIds = [
	SystemInterface.CommandId.ClearDisplay,
	SystemInterface.CommandId.PlayMedia,
	SystemInterface.CommandId.PauseMedia,
	SystemInterface.CommandId.PlayCacheStream,
	SystemInterface.CommandId.CreateCacheStream,
	SystemInterface.CommandId.RemoveStream,
	SystemInterface.CommandId.ClearCache,
	SystemInterface.CommandId.ShowWebUrl,
	SystemInterface.CommandId.ShowCameraImage,
	SystemInterface.CommandId.PlayCameraStream,
	SystemInterface.CommandId.CreateWebDisplayIntent,
	SystemInterface.CommandId.CreateMediaDisplayIntent,
	SystemInterface.CommandId.CreateStreamCacheDisplayIntent,
	SystemInterface.CommandId.CreateCameraImageDisplayIntent,
	SystemInterface.CommandId.CreateCameraStreamDisplayIntent,
	SystemInterface.CommandId.CreateMonitorProgram,
	SystemInterface.CommandId.ShowDesktopCountdown
];

class MonitorServer extends ServerBase {
	constructor () {
		super ();
		this.setName ("MonitorServer");
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
		this.getDiskSpaceTask.setAsync ((err) => {
			Log.debug (`${this.name} failed to get free disk space; err=${err}`);
		});
		this.cacheDataPath = Path.join (App.DATA_DIRECTORY, App.StreamCachePath);
		this.streamCount = 0;
		this.cacheMtime = 0;

		this.screenshotTask = new RepeatTask ();
		this.screenshotTime = 0;

		this.playerProcessName = VlcProcessName;
		this.playerProcessArgs = [
			"-I", "dummy",
			"--fullscreen",
			"--video-on-top",
			"--no-osd",
			"--no-loop",
			"--play-and-exit",
			"--prefetch-buffer-size=4"
		];

		this.emitter = new EventEmitter ();
		this.emitter.setMaxListeners (0);
		this.clearDisplayTaskGroup = new TaskGroup ();
		this.clearDisplayTaskGroup.maxRunCount = 1;
	}

	// Execute subclass-specific start operations
	async doStart () {
		this.isPlayPaused = false;
		if (this.configureMap.xDisplay.toLowerCase () == "none") {
			Log.info (`${this.name} X server commands disabled by configuration, xDisplay=none`);
		}
		else {
			this.xDisplay = this.configureMap.xDisplay;
		}

		await FsUtil.createDirectory (this.cacheDataPath);
		await FsUtil.createDirectory (Path.join (this.cacheDataPath, App.StreamReferencePath));
		await this.getDiskSpace ();
		await this.awaitSystemReady ();
		await this.getDisplayInfo ();
		await this.readStreamCache ();
		this.cacheMtime = Date.now ();

		for (const cmdid of MonitorInvokeCommandIds) {
			this.addInvokeRequestHandler (SystemInterface.Constant.DefaultInvokePath, cmdid);
		}
		this.addLinkCommandHandler (SystemInterface.CommandId.FindStreamItems);
		this.addSecondaryInvokeRequestHandler (ThumbnailPath, SystemInterface.CommandId.GetThumbnailImage);

		App.systemAgent.addSecondaryRequestHandler (ScreenshotPath, (request, response) => {
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
				this.captureScreenshot ().catch ((err) => {
					Log.debug (`${this.name} failed to capture screenshot; err=${err}`);
				}).then (() => {
					callback ();
				});
			}, this.configureMap.screenshotPeriod * 1000);
		}

		this.clearDisplayTaskGroup.start ();
		this.getDiskSpaceTask.setRepeating (this.getDiskSpace.bind (this), GetDiskSpacePeriod);

		App.systemAgent.getApplicationNews ();
		await this.deactivateDesktopBlank ();
	}

	// Wait until the host system becomes ready to execute monitor operations
	async awaitSystemReady () {
		let runlevel;

		runlevel = "";
		while (runlevel == "") {
			const proc = new ExecProcess (RunlevelProcessName, [ ]);
			proc.onReadLines ((lines, parseCallback) => {
				if (runlevel == "") {
					for (const line of lines) {
						if (line.indexOf ("unknown") < 0) {
							runlevel = line;
							break;
						}
					}
				}
				process.nextTick (parseCallback);
			});
			await proc.awaitEnd ();
			if (runlevel != "") {
				await new Promise ((resolve, reject) => { setTimeout (resolve, App.HeartbeatPeriod * 4) });
			}
		}
	}

	// Update free disk space values
	async getDiskSpace () {
		const task = await App.systemAgent.runBackgroundTask (new GetDiskSpaceTask ({
			targetPath: this.cacheDataPath
		}));
		if (task.isSuccess) {
			this.totalStorage = task.resultObject.total;
			this.usedStorage = task.resultObject.used;
			this.freeStorage = task.resultObject.free;
		}
	}

	// Read and store display info values
	async getDisplayInfo () {
		let displaywidth, displayheight;

		if (this.xDisplay == "") {
			return;
		}
		displaywidth = 0;
		displayheight = 0;
		try {
			await App.systemAgent.runProcess (XdpyinfoProcessName, [ ], { "DISPLAY": this.xDisplay }, "", (lines, parseCallback) => {
				for (const line of lines) {
					const m = line.match (/dimensions:.*?([0-9]+)x([0-9]+)[^0-9]/);
					if (m != null) {
						displaywidth = parseInt (m[1]);
						displayheight = parseInt (m[2]);
					}
				}
				process.nextTick (parseCallback);
			});
			if ((displaywidth <= 0) || (displayheight <= 0)) {
				this.isShowUrlAvailable = false;
			}
			else {
				if ((displaywidth != this.displayWidth) || (displayheight != this.displayHeight)) {
					Log.debug (`${this.name} xDisplay=${this.xDisplay} displayWidth=${displaywidth} displayHeight=${displayheight}`);
				}
				this.displayWidth = displaywidth;
				this.displayHeight = displayheight;
				this.isShowUrlAvailable = true;
			}
		}
		catch (err) {
			Log.debug (`Error reading display info; err=${err}`);
			this.isShowUrlAvailable = false;
		}
	}

	// Execute fn (streamPath) as an async function for each item in the stream cache
	async processStreamCache (fn) {
		const files = await FsUtil.readDirectory (this.cacheDataPath);
		const ids = files.filter ((file) => {
			return (App.systemAgent.getUuidCommand (file) == SystemInterface.CommandId.StreamItem);
		});
		for (const id of ids) {
			await fn (Path.join (this.cacheDataPath, id));
		}
	}

	// Read stream records from the cache, verify existence of stream files, and remove streams with invalid data
	async readStreamCache () {
		let streamcount;

		streamcount = 0;
		const removedirs = [ ];
		const removefiles = [ ];
		await this.processStreamCache (async (streamPath) => {
			let refpath;

			refpath = "";
			try {
				const data = await FsUtil.readFile (Path.join (streamPath, App.StreamRecordFilename));
				const streamrecord = SystemInterface.parseCommand (data);
				if (SystemInterface.isError (streamrecord) || (streamrecord.command != SystemInterface.CommandId.StreamItem))  {
					throw Error ("Invalid stream record");
				}
				if ((typeof streamrecord.params.sourceId == "string") && (streamrecord.params.sourceId !== "")) {
					refpath = Path.join (this.cacheDataPath, App.StreamReferencePath, streamrecord.params.sourceId);
				}
				const filenames = [ ];
				for (let i = 0; i < streamrecord.params.segmentCount; ++i) {
					filenames.push (Path.join (streamPath, App.StreamHlsPath, `${i}.ts`));
					filenames.push (Path.join (streamPath, App.StreamThumbnailPath, `${i}.jpg`));
				}
				await FsUtil.statFiles (filenames, (filename, stats) => {
					return (stats.isFile () && (stats.size > 0));
				});
				++streamcount;
			}
			catch (err) {
				Log.warn (`${this.name} Invalid stream cache entry, deleted; path=${streamPath} err=${err}`);
				removedirs.push (streamPath);
				if (refpath !== "") {
					removefiles.push (refpath);
				}
			}
		});
		for (const path of removedirs) {
			try {
				await FsUtil.removeDirectory (path);
			}
			catch (err) {
				Log.debug (`${this.name} failed to remove stream cache directory; path=${path} err=${err}`);
			}
		}
		for (const path of removefiles) {
			try {
				if (await FsUtil.fileExists (path)) {
					await FsUtil.removeFile (path);
				}
			}
			catch (err) {
				Log.debug (`${this.name} failed to remove stream cache file; path=${path} err=${err}`);
			}
		}

		streamcount -= removedirs.length;
		if (streamcount < 0) {
			streamcount = 0;
		}
		this.streamCount = streamcount;
	}

	// Execute subclass-specific stop operations
	async doStop () {
		this.clearDisplayTaskGroup.stop ();
		this.getDiskSpaceTask.stop ();
		this.getDisplayInfoTask.stop ();
		this.screenshotTask.stop ();
		await this.clear ();
	}

	// Return a command invocation containing the server's status
	doGetStatus (cmdInv) {
		const params = {
			freeStorage: this.freeStorage,
			totalStorage: this.totalStorage,
			streamCount: this.streamCount,
			cacheMtime: this.cacheMtime,
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

		return (App.systemAgent.createCommand (SystemInterface.CommandId.MonitorServerStatus, params));
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
				(fields.displayTarget !== this.lastStatus.displayTarget) ||
				(fields.streamCount !== this.lastStatus.streamCount);
		}
		this.lastStatus = fields;

		return (result);
	}

	// Execute a ClearDisplay command
	async clearDisplay (cmdInv, request, response) {
		App.systemAgent.removeIntentGroup (this.name);
		await this.clear ();
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
	}

	// Execute a PlayMedia command
	async playMedia (cmdInv, request, response) {
		let playid;

		if (typeof cmdInv.params.streamId == "string") {
			playid = "";

			if (await FsUtil.fileExists (Path.join (this.cacheDataPath, cmdInv.params.streamId, App.StreamRecordFilename))) {
				playid = cmdInv.params.streamId;
			}
			if (playid == "") {
				const refpath = Path.join (this.cacheDataPath, App.StreamReferencePath, cmdInv.params.streamId);
				if (await FsUtil.fileExists (refpath)) {
					const cacheid = await FsUtil.readFile (refpath);
					if (await FsUtil.fileExists (Path.join (this.cacheDataPath, cacheid, App.StreamRecordFilename))) {
						playid = cacheid;
					}
				}
			}
			if (playid != "") {
				const playparams = {
					streamId: playid
				};
				if (typeof cmdInv.params.startPosition == "number") {
					playparams.startPosition = cmdInv.params.startPosition;
				}
				if ((typeof cmdInv.params.minStartPositionDelta == "number") && (typeof cmdInv.params.maxStartPositionDelta == "number")) {
					playparams.minStartPositionDelta = cmdInv.params.minStartPositionDelta;
					playparams.maxStartPositionDelta = cmdInv.params.maxStartPositionDelta;
				}
				const playcmd = App.systemAgent.createCommand (SystemInterface.CommandId.PlayCacheStream, playparams);
				if (playcmd != null) {
					await this.playCacheStream (playcmd, request, response);
					return;
				}
			}
		}

		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}

		this.displayMode = SystemInterface.Constant.PlayMediaDisplayState;
		this.playMediaName = cmdInv.params.mediaName;
		this.isPlaying = true;
		await this.runPlayerProcess (cmdInv.params.streamUrl);
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));

		if ((typeof cmdInv.params.thumbnailUrl == "string") && (cmdInv.params.thumbnailUrl != "")) {
			try {
				const req = new WebRequest (cmdInv.params.thumbnailUrl);
				req.savePath = Path.join (App.DATA_DIRECTORY, ScreenshotFilename);
				await req.get ();
				this.screenshotTime = Date.now ();
			}
			catch (err) {
				Log.debug (`${this.name} failed to load stream thumbnail image; err=${err}`);
			}
		}
	}

	// Execute a PauseMedia command
	async pauseMedia (cmdInv, request, response) {
		this.isPlayPaused = (! this.isPlayPaused);
		if (this.playProcess != null) {
			if (this.playProcess.isSuspended) {
				this.playProcess.unsuspend ();
			}
			else {
				this.playProcess.suspend ();
			}
		}

		const intents = App.systemAgent.findIntents (this.name, true);
		for (const intent of intents) {
			if (intent.isDisplayConditionActive) {
				if ((intent.name == "MediaDisplayIntent") || (intent.name == "StreamCacheDisplayIntent")) {
					intent.setPaused (this.isPlayPaused);
				}
			}
		}

		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
	}

	// Execute a PlayCacheStream command
	async playCacheStream (cmdInv, request, response) {
		let indexdata, firstsegment, pct, delta;

		const streampath = Path.join (this.cacheDataPath, cmdInv.params.streamId);
		const data = await FsUtil.readFile (Path.join (streampath, App.StreamRecordFilename));
		const streamrecord = SystemInterface.parseCommand (data);
		if (SystemInterface.isError (streamrecord) || (streamrecord.command != SystemInterface.CommandId.StreamItem)) {
			throw Error ("Invalid stream record");
		}

		const indexpath = Path.join ((App.systemAgent.memoryFilePath != "") ? App.systemAgent.memoryFilePath : this.cacheDataPath, App.StreamHlsIndexFilename);
		firstsegment = 0;
		pct = 0;
		delta = 0;
		if ((typeof cmdInv.params.startPosition == "number") && (cmdInv.params.startPosition > 0)) {
			for (let i = 0; i < streamrecord.params.segmentCount; ++i) {
				if (streamrecord.params.segmentPositions[i] >= cmdInv.params.startPosition) {
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
				delta = Math.floor ((pct / 100) * (streamrecord.params.segmentCount - firstsegment + 1));
				firstsegment += delta;
				if (firstsegment >= (streamrecord.params.segmentCount - 2)) {
					firstsegment = streamrecord.params.segmentCount - 2;
				}
			}
		}

		indexdata = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-ALLOW-CACHE:NO\n";
		if (streamrecord.params.hlsTargetDuration > 0) {
			indexdata += `#EXT-X-TARGETDURATION:${streamrecord.params.hlsTargetDuration}\n`;
		}
		else {
			indexdata += "#EXT-X-TARGETDURATION:5\n";
		}
		for (let i = firstsegment; i < streamrecord.params.segmentCount; ++i) {
			indexdata += `#EXTINF:${streamrecord.params.segmentLengths[i]},\n`;
			indexdata += Path.join (this.cacheDataPath, streamrecord.params.id, App.StreamHlsPath, streamrecord.params.segmentFilenames[i]);
			indexdata += "\n";
		}
		indexdata += "#EXT-X-ENDLIST\n";

		this.displayMode = SystemInterface.Constant.PlayMediaDisplayState;
		await FsUtil.writeFile (indexpath, indexdata, { });
		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}
		this.playMediaName = streamrecord.params.name;
		this.isPlaying = true;
		await this.runPlayerProcess (indexpath);
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));

		try {
			await FsUtil.copyFile (Path.join (this.cacheDataPath, cmdInv.params.streamId, App.StreamThumbnailPath, `${firstsegment}.jpg`), Path.join (App.DATA_DIRECTORY, ScreenshotFilename));
			this.screenshotTime = Date.now ();
		}
		catch (err) {
			Log.debug (`${this.name} failed to copy stream thumbnail image; err=${err}`);
		}
	}

	// Execute a ClearCache command
	async clearCache (cmdInv, request, response) {
		App.systemAgent.removeIntentGroup (this.name);
		await this.clear ();
		try {
			await FsUtil.removeDirectory (this.cacheDataPath);
			await FsUtil.createDirectory (this.cacheDataPath);
			this.streamCount = 0;
			this.getDiskSpaceTask.setNextRepeat (0);
		}
		catch (err) {
			Log.warn (`Failed to clear cache data directory; path=${this.cacheDataPath} err=${err}`);
		}
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
	}

	// Stop all running display processes
	async clear () {
		if (this.clearDisplayTaskGroup.runCount > 0) {
			await this.clearDisplayTaskGroup.awaitIdle ();
			return;
		}
		const task = new ExecuteTask ({
			run: async () => {
				await this.stopBrowser ();
				await this.stopPlayer ();
				await this.stopSurface ();
				this.isPlayPaused = false;
			}
		});
		await this.clearDisplayTaskGroup.awaitRun (task);
	}

	// Stop any active media player process
	async stopPlayer () {
		if (this.playProcess) {
			this.playProcess.unsuspend ();
			this.playProcess.stop ();
			await this.playProcess.awaitEnd ();
		}
		this.playProcess = null;
		this.isPlaying = false;
	}

	// Stop any active browser process
	async stopBrowser () {
		this.runBrowserProcessTask.stop ();
		this.findBrowserProcessTask.stop ();
		if (! this.isShowingUrl) {
			return;
		}
		try {
			await App.systemAgent.runProcess (KillallProcessName, [
				"-q", "chromium-browse", "chromium-browser-v7", "chromium-browser"
			]);
		}
		catch (err) {
			Log.err (`${this.name} error stopping browser process; err=${err}`);
		}
	}

	// Stop any active surface process
	async stopSurface () {
		if (this.surfaceProcess != null) {
			this.surfaceProcess.stop ();
			this.surfaceProcess = null;
		}
	}

	// Execute a ShowWebUrl command
	async showWebUrl (cmdInv, request, response) {
		if (! this.isShowUrlAvailable) {
			App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
				success: false
			}));
			return;
		}

		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}
		this.displayMode = SystemInterface.Constant.ShowUrlDisplayState;
		await this.clear ();
		await this.deactivateDesktopBlank ();
		this.runBrowserProcessTask.setRepeating ((callback) => {
			this.runBrowserProcess (cmdInv.params.url, callback);
		}, RunBrowserProcessPeriod);
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
	}

	// Execute a ShowCameraImage command
	async showCameraImage (cmdInv, request, response) {
		const cmd = App.systemAgent.createCommand (SystemInterface.CommandId.GetCaptureImage, {
			sensor: cmdInv.params.sensor,
			imageTime: cmdInv.params.imageTime
		});
		if (cmd == null) {
			throw Error ("Failed to create GetCaptureImage command");
		}

		await this.clearImageCache ();
		const camerastatus = await App.systemAgent.agentControl.invokeHostCommand (cmdInv.params.host, SystemInterface.Constant.DefaultInvokePath, App.systemAgent.createCommand (SystemInterface.CommandId.GetStatus), SystemInterface.CommandId.AgentStatus);
		if (camerastatus.params.cameraServerStatus == null) {
			throw Error ("Host provided no camera server status");
		}
		const filename = await this.getImageCacheFilename ("jpg");
		const req = new WebRequest (`http:${App.DoubleSlash}${StringUtil.parseAddressHostname (cmdInv.params.host.hostname)}:${camerastatus.params.tcpPort2}${camerastatus.params.cameraServerStatus.captureImagePath}?${SystemInterface.Constant.UrlQueryParameter}=${encodeURIComponent (JSON.stringify (cmd))}`);
		req.savePath = Path.join (App.DATA_DIRECTORY, filename);
		const urlfile = await req.get ();
		Log.debug (`${this.name} ShowCameraImage saved image data; path=${urlfile}`);

		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}

		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
		this.displayMode = SystemInterface.Constant.ShowImageDisplayState;
		this.showImageName = cmdInv.params.host.hostname;

		if (this.surfaceProcess == null) {
			await this.clear ();
		}
		if (typeof cmdInv.params.displayTimestamp == "number") {
			await this.commandSurfaceProcess (App.systemAgent.createCommand (SystemInterface.CommandId.RemoveWindow, {
				windowId: "timestamp"
			}));
		}
		await this.commandSurfaceProcess (App.systemAgent.createCommand (SystemInterface.CommandId.ShowFileImageBackground, {
			imagePath: urlfile,
			background: SystemInterface.Constant.FitStretchBackground
		}));
		if (typeof cmdInv.params.displayTimestamp == "number") {
			await this.commandSurfaceProcess (App.systemAgent.createCommand (SystemInterface.CommandId.ShowIconLabelWindow, {
				windowId: "timestamp",
				icon: SystemInterface.Constant.DateIcon,
				positionX: -1,
				positionY: -1,
				labelText: App.uiText.getDateString (cmdInv.params.displayTimestamp)
			}));
		}

		try {
			FsUtil.copyFile (urlfile, Path.join (App.DATA_DIRECTORY, ScreenshotFilename));
			this.screenshotTime = Date.now ();
		}
		catch (err) {
			Log.debug (`${this.name} failed to copy camera thumbnail image; err=${err}`);
		}
	}

	// Execute a PlayCameraStream command
	async playCameraStream (cmdInv, request, response) {
		const cmd = App.systemAgent.createCommand (SystemInterface.CommandId.GetCameraStream, {
			sensor: cmdInv.params.sensor,
			monitorName: App.systemAgent.displayName,
			streamProfile: cmdInv.params.streamProfile,
			flip: cmdInv.params.flip
		});
		if (cmd == null) {
			App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
				success: false
			}));
			return;
		}

		if (this.displayMode == SystemInterface.Constant.PlayCameraStreamDisplayState) {
			await this.clear ();
		}
		const responsecmd = await App.systemAgent.agentControl.invokeHostCommand (cmdInv.params.host, SystemInterface.Constant.DefaultInvokePath, cmd, SystemInterface.CommandId.GetCameraStreamResult);
		const streamurl = responsecmd.params.streamUrl;

		if (cmdInv.prefix[SystemInterface.Constant.AgentIdPrefixField] != App.systemAgent.agentId) {
			App.systemAgent.removeIntentGroup (this.name);
		}
		this.displayMode = SystemInterface.Constant.PlayCameraStreamDisplayState;
		await this.clear ();
		this.playMediaName = cmdInv.params.host.hostname;
		this.isPlaying = true;
		await this.runPlayerProcess (streamurl);
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));

		try {
			await FsUtil.copyFile (Path.join (App.BIN_DIRECTORY, CameraScreenshotFilename), Path.join (App.DATA_DIRECTORY, ScreenshotFilename));
			this.screenshotTime = Date.now ();
		}
		catch (err) {
			Log.debug (`${this.name} failed to copy camera screenshot image; err=${err}`);
		}
	}

	// Run a browser process if one is not already running, and invoke the provided callback when complete
	runBrowserProcess (url, callback) {
		let proc;

		if (this.xDisplay == "") {
			this.runBrowserProcessTask.stop ();
			process.nextTick (callback);
			return;
		}

		Log.debug (`${this.name} run browser; url=${url}`);
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
			]);
			proc.onReadLines ((lines, parseCallback) => {
				for (const line of lines) {
					Log.debug4 (`${this.name} browser output: ${line}`);
				}
				process.nextTick (parseCallback);
			});
			proc.onEnd ((err, isExitSuccess) => {
				Log.debug3 (`${this.name} browser end; err=${err} isExitSuccess=${isExitSuccess}`);
				if (proc == this.browserProcess) {
					this.browserProcess = null;
					this.isShowingUrl = false;
				}
				this.findBrowserProcessTask.setNextRepeat (0);
			});
			proc.env = {
				"DISPLAY": this.xDisplay
			};
			this.browserProcess = proc;

			if ((this.displayWidth > 0) && (this.displayHeight > 0)) {
				App.systemAgent.runProcess (XdotoolProcessName, [ "mousemove", this.displayWidth, 0 ], { "DISPLAY": this.xDisplay }).then ((isExitSuccess) => {
				}).catch ((err) => {
					Log.err (`${this.name} failed to run xdotool; err=${err}`);
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
			Log.err (`${this.name} error finding browser process; err=${err}`);
		}).then (() => {
			callback ();
		});
	}

	// Run a media player process
	async runPlayerProcess (targetMedia, playerArgs) {
		let startedsurface;

		startedsurface = false;
		await this.stopBrowser ();
		await this.stopSurface ();
		if ((this.displayWidth > 0) && (this.displayHeight > 0)) {
			App.systemAgent.runProcess (XdotoolProcessName, [ "mousemove", this.displayWidth, 0 ], { "DISPLAY": this.xDisplay }).then ((isExitSuccess) => {
			}).catch ((err) => {
				Log.err (`${this.name} failed to run xdotool; err=${err}`);
			});
		}
		if (this.playProcess != null) {
			this.playProcess.suspend ();
			await this.commandSurfaceProcess (App.systemAgent.createCommand (SystemInterface.CommandId.ShowColorFillBackground, {
				fillColorR: 0,
				fillColorG: 0,
				fillColorB: 0
			}));
			startedsurface = true;
			if (this.playProcess != null) {
				this.playProcess.unsuspend ();
				this.playProcess.stop ();
				this.playProcess = null;
			}
		}

		const args = (Array.isArray (playerArgs) ? playerArgs : [ ]).concat (this.playerProcessArgs);
		args.push (targetMedia);
		Log.debug (`${this.name} run media player; processName="${this.playerProcessName}" args=${JSON.stringify (args)}`);
		const proc = new ExecProcess (this.playerProcessName, args);
		proc.env = {
			"DISPLAY": this.xDisplay
		};
		proc.onReadLines ((lines, parseCallback) => {
			if (startedsurface) {
				startedsurface = false;
				setTimeout (() => {
					if (proc == this.playProcess) {
						this.stopSurface ().catch ((err) => {
							Log.debug (`${this.name} failed to stop surface process; err=${err}`);
						});
					}
				}, PlayMediaBlankPeriod);
			}
			process.nextTick (parseCallback);
		});
		proc.onEnd ((err, isExitSuccess) => {
			Log.debug3 (`${this.name} player end; err=${err} isExitSuccess=${isExitSuccess}`);
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

	// Run a display surface process. If envValues is provided, add its attributes to the process environment.
	runSurfaceProcess (envValues) {
		Log.debug (`${this.name} run surface`);

		if ((this.displayWidth > 0) && (this.displayHeight > 0)) {
			App.systemAgent.runProcess (XdotoolProcessName, [ "mousemove", this.displayWidth, 0 ], { "DISPLAY": this.xDisplay }).then ((isExitSuccess) => {
			}).catch ((err) => {
				Log.err (`${this.name} failed to run xdotool; err=${err}`);
			});
		}

		const proc = new ExecProcess (Path.join (App.BIN_DIRECTORY, "membrane-surface", "membrane-surface"));
		proc.onReadLines ((lines, parseCallback) => {
			for (const line of lines) {
				if (line.match (/^\[.*?\]\s*\{/)) {
					this.emitter.emit (SurfaceResponseEvent, line);
				}
			}
			process.nextTick (parseCallback);
		});
		proc.onEnd ((err, isExitSuccess) => {
			if (proc == this.surfaceProcess) {
				this.surfaceProcess = null;
			}
			this.emitter.emit (SurfaceEndEvent);
		});
		proc.env = {
			"DISPLAY": this.xDisplay,
			"RESOURCE_PATH": Path.join (App.BIN_DIRECTORY, "membrane-surface", "membrane-surface.dat"),
			"LD_LIBRARY_PATH": Path.join (App.BIN_DIRECTORY, "membrane-surface")
		};
		if (envValues !== undefined) {
			for (const key in envValues) {
				proc.env[key] = envValues[key];
			}
		}
		this.surfaceProcess = proc;
		this.isPlayPaused = false;
	}

	// Write cmdInv to the surface process. If the surface process is not running, clear the display and launch the surface process before writing the command.
	async commandSurfaceProcess (cmdInv) {
		if (cmdInv == null) {
			return;
		}
		if (this.surfaceProcess == null) {
			this.runSurfaceProcess ();
		}
		if (this.surfaceProcess == null) {
			Log.debug (`${this.name} discard surface command (failed to launch surface process)`);
			return;
		}
		await new Promise ((resolve, reject) => {
			const timeout = setTimeout (resolve, SurfaceResponseWaitPeriod);
			this.emitter.once (SurfaceResponseEvent, (responseCommand) => {
				clearTimeout (timeout);
				resolve ();
			});
			this.surfaceProcess.write (JSON.stringify (cmdInv));
		});
	}

	// Deactivate and disable desktop screen blank functionality
	async deactivateDesktopBlank () {
		if (this.xDisplay == "") {
			return;
		}
		try {
			await App.systemAgent.runProcess (XsetProcessName, [ "s", "off" ], { "DISPLAY": this.xDisplay });
			await App.systemAgent.runProcess (XsetProcessName, [ "-dpms" ], { "DISPLAY": this.xDisplay });
			await App.systemAgent.runProcess (XsetProcessName, [ "s", "noblank" ], { "DISPLAY": this.xDisplay });
		}
		catch (err) {
			Log.err (`${this.name} error deactivating desktop blank; err=${err}`);
		}
	}

	// Activate the desktop screen blank
	async activateDesktopBlank () {
		if (this.xDisplay == "") {
			return;
		}
		try {
			await App.systemAgent.runProcess (XsetProcessName, [ "s", "activate" ], { "DISPLAY": this.xDisplay });
		}
		catch (err) {
			Log.err (`${this.name} error activating desktop blank; err=${err}`);
		}
	}

	// Execute a CreateWebDisplayIntent command
	async createWebDisplayIntent (cmdInv, request, response) {
		const intent = Intent.createIntent ("WebDisplayIntent", cmdInv.params);
		App.systemAgent.removeIntentGroup (this.name);
		await this.clear ();
		App.systemAgent.runIntent (intent, this.name);
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
	}

	// Execute a CreateMediaDisplayIntent command
	async createMediaDisplayIntent (cmdInv, request, response) {
		const intent = Intent.createIntent ("MediaDisplayIntent", cmdInv.params);
		App.systemAgent.removeIntentGroup (this.name);
		await this.clear ();
		App.systemAgent.runIntent (intent, this.name);
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
	}

	// Execute a CreateStreamCacheDisplayIntent command
	async createStreamCacheDisplayIntent (cmdInv, request, response) {
		const intent = Intent.createIntent ("StreamCacheDisplayIntent", cmdInv.params);
		App.systemAgent.removeIntentGroup (this.name);
		await this.clear ();
		App.systemAgent.runIntent (intent, this.name);
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
	}

	// Execute a CreateCameraImageDisplayIntent command
	async createCameraImageDisplayIntent (cmdInv, request, response) {
		const intent = Intent.createIntent ("CameraImageDisplayIntent", cmdInv.params);
		App.systemAgent.removeIntentGroup (this.name);
		await this.clear ();
		App.systemAgent.runIntent (intent, this.name);
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
	}

	// Execute a CreateCameraStreamDisplayIntent command
	async createCameraStreamDisplayIntent (cmdInv, request, response) {
		const intent = Intent.createIntent ("CameraStreamDisplayIntent", cmdInv.params);
		App.systemAgent.removeIntentGroup (this.name);
		await this.clear ();
		App.systemAgent.runIntent (intent, this.name);
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
	}

	// Execute a CreateMonitorProgram command
	async createMonitorProgram (cmdInv, request, response) {
		let item;

		const params = {
			success: true,
			error: ""
		};
		const intents = [ ];
		for (const directive of cmdInv.params.directives) {
			item = null;
			try {
				if (directive.webDisplayIntent !== undefined) {
					item = Intent.createIntent ("WebDisplayIntent", directive.webDisplayIntent);
				}
				else if (directive.mediaDisplayIntent !== undefined) {
					item = Intent.createIntent ("MediaDisplayIntent", directive.mediaDisplayIntent);
				}
				else if (directive.streamCacheDisplayIntent !== undefined) {
					item = Intent.createIntent ("StreamCacheDisplayIntent", directive.streamCacheDisplayIntent);
				}
			}
			catch (err) {
				item = null;
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
			await this.clear ();
			for (const intent of intents) {
				App.systemAgent.runIntent (intent, this.name);
			}
		}
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, params));
	}

	// Execute a CreateCacheStream command
	async createCacheStream (cmdInv, request, response) {
		const refpath = Path.join (this.cacheDataPath, App.StreamReferencePath, cmdInv.params.streamId);
		if (await FsUtil.fileExists (refpath)) {
			const cacheid = await FsUtil.readFile (refpath);
			if (await FsUtil.fileExists (Path.join (this.cacheDataPath, cacheid, App.StreamRecordFilename))) {
				App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
					success: true
				}));
				return;
			}
		}

		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
		try {
			const id = App.systemAgent.getUuid (SystemInterface.CommandId.StreamItem);
			await App.systemAgent.runTask (new CacheMediaStreamTask ({
				cacheStreamId: id,
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
			}));
			await FsUtil.writeFile (refpath, id, { });
			this.getDiskSpaceTask.setNextRepeat (0);
			++(this.streamCount);
			this.cacheMtime = Date.now ();
		}
		catch (err) {
			Log.err (`Failed to cache stream; err=${err}`);
		}
	}

	// Execute a RemoveStream command
	async removeStream (cmdInv, request, response) {
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));

		const streampath = Path.join (this.cacheDataPath, cmdInv.params.id);
		try {
			const recordpath = Path.join (streampath, App.StreamRecordFilename);
			if (! await FsUtil.fileExists (recordpath)) {
				return;
			}
			const data = await FsUtil.readFile (recordpath);
			const streamrecord = SystemInterface.parseCommand (data);
			if (SystemInterface.isError (streamrecord) || (streamrecord.command != SystemInterface.CommandId.StreamItem))  {
				return;
			}

			Log.debug (`${this.name} remove cache stream for received RemoveStream command; path=${streampath}`);
			await FsUtil.removeDirectory (streampath);
			--(this.streamCount);
			this.cacheMtime = Date.now ();
			if ((typeof streamrecord.params.sourceId == "string") && (streamrecord.params.sourceId !== "")) {
				const refpath = Path.join (this.cacheDataPath, App.StreamReferencePath, streamrecord.params.sourceId);
				if (await FsUtil.fileExists (refpath)) {
					await FsUtil.removeFile (refpath);
				}
			}
			this.getDiskSpaceTask.setNextRepeat (0);
		}
		catch (err) {
			Log.warn (`Failed to remove cache stream directory; path=${streampath} err=${err}`);
		}
	}

	// Execute a FindStreamItems command
	async findStreamItems (cmdInv, client) {
		// Search key filters and result offsets are not implemented
		const cmd = App.systemAgent.createCommand (SystemInterface.CommandId.FindStreamItemsResult, {
			searchKey: "",
			setSize: this.streamCount,
			resultOffset: 0
		});
		if (cmd == null) {
			return;
		}
		client.emit (SystemInterface.Constant.WebSocketEvent, cmd);
		await this.processStreamCache (async (streamPath) => {
			const data = await FsUtil.readFile (Path.join (streamPath, App.StreamRecordFilename));
			const streamrecord = SystemInterface.parseCommand (data);
			if ((! SystemInterface.isError (streamrecord)) && (streamrecord.command == SystemInterface.CommandId.StreamItem))  {
				client.emit (SystemInterface.Constant.WebSocketEvent, streamrecord);
			}
		});
	}

	// Execute a GetThumbnailImage command
	async getThumbnailImage (cmdInv, request, response) {
		const path = Path.join (this.cacheDataPath, cmdInv.params.id, App.StreamThumbnailPath, `${cmdInv.params.thumbnailIndex}.jpg`);
		App.systemAgent.writeFileResponse (request, response, path, "image/jpeg");
	}

	// Update the monitor's screenshot image to reflect display state
	async captureScreenshot () {
		if ((this.xDisplay == "") || this.isPlaying || (this.surfaceProcess != null)) {
			return;
		}
		const now = Date.now ();
		const targetpath = Path.join (App.DATA_DIRECTORY, `screenshot_${now}.jpg`);
		try {
			await App.systemAgent.runProcess (ScrotProcessName,
				[ targetpath, "-z", "-q", "90" ],
				{ "DISPLAY": this.xDisplay }
			);
			await FsUtil.renameFile (targetpath, Path.join (App.DATA_DIRECTORY, ScreenshotFilename));
			this.screenshotTime = now;
		}
		catch (err) {
			Log.debug (`Failed to capture display screenshot; err=${err}`);
			Fs.unlink (targetpath, () => { });
		}
	}

	// Return the name of a nonexistent file in the image cache
	async getImageCacheFilename (extension) {
		let stats;

		while (true) {
			const filename = `${ImageFilenamePrefix}${Date.now ()}_${App.systemAgent.getRandomString (16)}.${extension}`;
			try {
				stats = await FsUtil.statFile (Path.join (App.DATA_DIRECTORY, filename));
			}
			catch (err) {
				stats = null;
				if (err.code != "ENOENT") {
					throw err;
				}
			}
			if (stats == null) {
				return (filename);
			}
		}
	}

	// Remove all image cache files
	async clearImageCache () {
		const files = await FsUtil.readDirectory (App.DATA_DIRECTORY);
		for (const file of files) {
			if (file.indexOf (ImageFilenamePrefix) == 0) {
				const path = Path.join (App.DATA_DIRECTORY, file);
				try {
					await FsUtil.removeFile (path);
				}
				catch (err) {
					Log.debug (`${this.name} failed to delete image cache file; path=${path} err=${err}`);
				}
			}
		}
	}

	// Execute a ShowDesktopCountdown command
	async showDesktopCountdown (cmdInv, request, response) {
		let bgpath;

		const commands = [ ];
		bgpath = "";
		if (this.xDisplay != "") {
			try {
				bgpath = Path.join (App.DATA_DIRECTORY, `showDesktopCountdown_${Date.now ()}.jpg`);
				await App.systemAgent.runProcess (ScrotProcessName,
					[ bgpath, "-z", "-q", "90" ],
					{ "DISPLAY": this.xDisplay }
				);
				if (this.surfaceProcess != null) {
					commands.push ({
						executeTime: 0,
						command: App.systemAgent.createCommand (SystemInterface.CommandId.ShowFileImageBackground, {
							imagePath: bgpath,
							background: SystemInterface.Constant.CenterBackground
						})
					});
				}
			}
			catch (err) {
				Log.debug (`${this.name} showDesktopCountdown failed to capture screenshot image; err=${err}`);
				bgpath = "";
			}
		}
		const cmd = App.systemAgent.createCommand (SystemInterface.CommandId.ShowCountdownWindow, {
			windowId: "ShowCountdownWindow",
			icon: SystemInterface.Constant.CountdownIcon,
			positionX: -80,
			positionY: -80,
			labelText: App.uiText.getText ("WebCountdownWindowText"),
			countdownTime: cmdInv.params.countdownTime
		});
		if (cmd == null) {
			App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
				success: false
			}));
			return;
		}
		if (this.surfaceProcess == null) {
			const env = { };
			if (bgpath != "") {
				env["BACKGROUND_IMAGE_PATH"] = bgpath;
				env["BACKGROUND_IMAGE_TYPE"] = SystemInterface.Constant.CenterBackground;
			}
			this.runSurfaceProcess (env);
		}
		if (this.surfaceProcess == null) {
			Log.debug (`${this.name} discard ShowDesktopCountdown command (failed to launch surface process)`);
			Fs.unlink (bgpath, () => { });
			return;
		}
		this.emitter.once (SurfaceEndEvent, () => {
			Fs.unlink (bgpath, () => { });
		});

		await this.commandSurfaceProcess (cmd);
		App.systemAgent.writeCommandResponse (request, response, App.systemAgent.createCommand (SystemInterface.CommandId.CommandResult, {
			success: true
		}));
	}
}
module.exports = MonitorServer;
