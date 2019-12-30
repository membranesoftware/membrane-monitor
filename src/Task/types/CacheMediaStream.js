/*
* Copyright 2018-2019 Membrane Software <author@membranesoftware.com> https://membranesoftware.com
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
const Fs = require ("fs");
const Path = require ("path");
const Url = require ("url");
const Log = require (App.SOURCE_DIRECTORY + "/Log");
const SystemInterface = require (App.SOURCE_DIRECTORY + "/SystemInterface");
const FsUtil = require (App.SOURCE_DIRECTORY + "/FsUtil");
const HlsIndexParser = require (App.SOURCE_DIRECTORY + "/HlsIndexParser");
const TaskBase = require (App.SOURCE_DIRECTORY + "/Task/TaskBase");

class CacheMediaStream extends TaskBase {
	constructor () {
		super ();
		this.name = App.uiText.getText ("cacheMediaStreamTaskName");
		this.resultObjectType = "StreamItem";

		this.configureParams = [
			{
				name: "streamId",
				type: "string",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.NotEmpty | SystemInterface.ParamFlag.Uuid,
				description: "The ID to use for the created stream"
			},
			{
				name: "streamUrl",
				type: "string",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.Url | SystemInterface.ParamFlag.NotEmpty,
				description: "The stream URL of the media item"
			},
			{
				name: "thumbnailUrl",
				type: "string",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.Url | SystemInterface.ParamFlag.NotEmpty,
				description: "The thumbnail URL of the media item"
			},
			{
				name: "dataPath",
				type: "string",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.NotEmpty,
				description: "The path to use for storage of stream data"
			},
			{
				name: "streamName",
				type: "string",
				flags: SystemInterface.ParamFlag.Required,
				description: "The name of the stream",
				defaultValue: ""
			},
			{
				name: "duration",
				type: "number",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.ZeroOrGreater,
				description: "The duration of the stream in milliseconds, or 0 if not known"
			},
			{
				name: "width",
				type: "number",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.ZeroOrGreater,
				description: "The frame width of the stream, or 0 if not known"
			},
			{
				name: "height",
				type: "number",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.ZeroOrGreater,
				description: "The frame height of the stream, or 0 if not known"
			},
			{
				name: "bitrate",
				type: "number",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.ZeroOrGreater,
				description: "The total stream bitrate in bits per second, or 0 if not known"
			},
			{
				name: "frameRate",
				type: "number",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.ZeroOrGreater,
				description: "The video frame rate in frames per second, or 0 if not known"
			}
		];

		this.streamDataPath = "";
		this.baseUrl = "";
		this.manifestUrl = "";
		this.progressPercentDelta = 1;
		this.cacheStreamId = "";
	}

	// Subclass method. Implementations should execute actions appropriate when the task has been successfully configured.
	doConfigure () {
		this.cacheStreamId = App.systemAgent.getUuid (SystemInterface.CommandId.StreamItem);
		this.subtitle = this.configureMap.streamName;
		this.statusMap.cacheStreamId = this.cacheStreamId;
		this.statusMap.streamId = this.configureMap.streamId;
		this.statusMap.streamName = this.configureMap.streamName;
		this.streamDataPath = Path.join (this.configureMap.dataPath, this.cacheStreamId);
	}

	// Subclass method. Implementations should execute task actions and call end when complete.
	doRun () {
		// TODO: Check isCancelled at each step

		FsUtil.createDirectory (this.configureMap.dataPath).then (() => {
			return (FsUtil.createDirectory (this.streamDataPath));
		}).then (() => {
			return (FsUtil.createDirectory (Path.join (this.streamDataPath, App.STREAM_HLS_PATH)));
		}).then (() => {
			return (FsUtil.createDirectory (Path.join (this.streamDataPath, App.STREAM_THUMBNAIL_PATH)));
		}).then (() => {
			let url, playcmd;

			url = Url.parse (this.configureMap.streamUrl);
			if (url == null) {
				return (Promise.reject (Error ("Invalid stream URL")));
			}
			this.baseUrl = url.protocol + "/" + "/" + url.hostname + ":" + url.port;

			playcmd = App.systemAgent.createCommand ("GetHlsManifest", SystemInterface.Constant.Stream, {
				streamId: this.configureMap.streamId
			});
			if (playcmd == null) {
				return (Promise.reject (Error ("Failed to create GetHlsManifest command")));
			}
			this.manifestUrl = this.configureMap.streamUrl + "?" + SystemInterface.Constant.UrlQueryParameter + "=" + encodeURIComponent (JSON.stringify (playcmd));

			return (App.systemAgent.fetchUrlData (this.manifestUrl));
		}).then ((urlData) => {
			this.setPercentComplete (1);
			return (this.fetchSegmentFiles (urlData));
		}).then (() => {
			this.setPercentComplete (100);
			this.isSuccess = true;
		}).catch ((err) => {
			Log.debug (`${this.toString ()} failed; err=${err}`);
		}).then (() => {
			this.end ();
		});
	}

	// Return a promise that fetches all segment files referenced in the provided HLS index data and stores the resulting base index file
	fetchSegmentFiles (hlsIndexData) {
		return (new Promise ((resolve, reject) => {
			let hls, recordparams, segmenturls, segmentindex, fetchNextSegment, fetchSegmentComplete, statSegmentComplete, fetchThumbnailComplete, statThumbnailComplete, writeRecordFile, writeRecordFileComplete;

			hls = HlsIndexParser.parse (hlsIndexData);
			if ((hls == null) || (hls.segmentCount <= 0)) {
				reject (Error ("Failed to parse stream index data"));
				return;
			}

			this.progressPercentDelta = (99 / hls.segmentCount);
			recordparams = {
				id: this.cacheStreamId,
				name: this.configureMap.streamName,
				sourceId: this.configureMap.streamId,
				duration: this.configureMap.duration,
				width: this.configureMap.width,
				height: this.configureMap.height,
				bitrate: this.configureMap.bitrate,
				frameRate: this.configureMap.frameRate,
				size: 0,
				segmentCount: hls.segmentCount,
				hlsTargetDuration: hls.hlsTargetDuration,
				segmentFilenames: [ ],
				segmentLengths: hls.segmentLengths,
				segmentPositions: hls.segmentPositions
			};
			segmenturls = [ ];
			segmentindex = 0;
			for (let file of hls.segmentFilenames) {
				segmenturls.push (file);
				recordparams.segmentFilenames.push (segmentindex + ".ts");
				++segmentindex;
			}

			recordparams.segmentCount = segmenturls.length;

			setTimeout (() => {
				segmentindex = -1;
				fetchNextSegment ();
			}, 0);

			fetchNextSegment = () => {
				++segmentindex;
				if (segmentindex >= segmenturls.length) {
					writeRecordFile ();
					return;
				}
				App.systemAgent.fetchUrlFile (this.baseUrl + segmenturls[segmentindex], Path.join (this.streamDataPath, App.STREAM_HLS_PATH), segmentindex + ".ts", fetchSegmentComplete);
			};

			fetchSegmentComplete = (err, destFilename) => {
				if (err != null) {
					reject (err);
					return;
				}

				Fs.stat (destFilename, statSegmentComplete);
			};

			statSegmentComplete = (err, stats) => {
				let url, cmd;

				if (err != null) {
					reject (err);
					return;
				}
				if (stats != null) {
					recordparams.size += stats.size;
				}

				cmd = App.systemAgent.createCommand ("GetThumbnailImage", SystemInterface.Constant.Stream, {
					id: this.configureMap.streamId,
					thumbnailIndex: segmentindex
				});
				if (cmd == null) {
					reject (Error ("Failed to create GetThumbnailImage command"));
					return;
				}
				url = this.configureMap.thumbnailUrl + "?" + SystemInterface.Constant.UrlQueryParameter + "=" + encodeURIComponent (JSON.stringify (cmd));
				App.systemAgent.fetchUrlFile (url, Path.join (this.streamDataPath, App.STREAM_THUMBNAIL_PATH), segmentindex + ".jpg", fetchThumbnailComplete);
			};

			fetchThumbnailComplete = (err, destFilename) => {
				if (err != null) {
					reject (err);
					return;
				}

				Fs.stat (destFilename, statThumbnailComplete);
			};

			statThumbnailComplete = (err, stats) => {
				if (err != null) {
					reject (err);
					return;
				}
				if (stats != null) {
					recordparams.size += stats.size;
				}

				this.addPercentComplete (this.progressPercentDelta);
				fetchNextSegment ();
			};

			writeRecordFile = () => {
				let record;

				if (err != null) {
					reject (err);
					return;
				}
				record = App.systemAgent.createCommand ("StreamItem", SystemInterface.Constant.Stream, recordparams);
				if (record == null) {
					reject (Error ("Failed to create StreamItem record"));
					return;
				}

				this.resultObject = record.params;
				FsUtil.writeFile (Path.join (this.streamDataPath, App.STREAM_RECORD_FILENAME), JSON.stringify (record), null, writeRecordFileComplete);
			};

			writeRecordFileComplete = (err) => {
				if (err != null) {
					reject (err);
					return;
				}

				resolve ();
			};
		}));
	}

	// Subclass method. Implementations should execute task actions and call end when complete.
	doEnd () {
		if (this.isSuccess && (! this.isCancelled)) {
			return;
		}
		FsUtil.removeDirectory (this.streamDataPath, (err) => {
		});
	}
}

module.exports = CacheMediaStream;
