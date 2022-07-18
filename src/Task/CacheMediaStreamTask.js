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
const Log = require (Path.join (App.SOURCE_DIRECTORY, "Log"));
const SystemInterface = require (Path.join (App.SOURCE_DIRECTORY, "SystemInterface"));
const FsUtil = require (Path.join (App.SOURCE_DIRECTORY, "FsUtil"));
const StringUtil = require (Path.join (App.SOURCE_DIRECTORY, "StringUtil"));
const WebRequest = require (Path.join (App.SOURCE_DIRECTORY, "WebRequest"));
const HlsIndexParser = require (Path.join (App.SOURCE_DIRECTORY, "HlsIndexParser"));
const Task = require (Path.join (App.SOURCE_DIRECTORY, "Task", "Task"));

class CacheMediaStreamTask extends Task {
	constructor (configureMap) {
		super (configureMap);
		this.name = App.uiText.getText ("CacheMediaStreamTaskName");

		this.configureParams = [
			{
				name: "cacheStreamId",
				type: "string",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.NotEmpty | SystemInterface.ParamFlag.Uuid,
				description: "The ID to use for the created stream"
			},
			{
				name: "streamId",
				type: "string",
				flags: SystemInterface.ParamFlag.Required | SystemInterface.ParamFlag.NotEmpty | SystemInterface.ParamFlag.Uuid,
				description: "The ID of the source stream"
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
		this.progressPercentDelta = 1;
	}

	async run () {
		const fields = SystemInterface.parseFields (this.configureParams, this.configureMap);
		if (SystemInterface.isError (fields)) {
			throw Error (`${this.toString ()} configuration parse failed; err=${fields}`);
		}
		this.configureMap = fields;
		this.subtitle = this.configureMap.streamName;
		this.statusMap.streamId = this.configureMap.streamId;
		this.statusMap.streamName = this.configureMap.streamName;
		this.streamDataPath = Path.join (this.configureMap.dataPath, this.configureMap.cacheStreamId);

		const url = StringUtil.parseUrl (this.configureMap.streamUrl);
		if (url == null) {
			throw Error ("Invalid stream URL");
		}
		await FsUtil.createDirectory (this.configureMap.dataPath);
		await FsUtil.createDirectory (this.streamDataPath);
		await FsUtil.createDirectory (Path.join (this.streamDataPath, App.StreamHlsPath));
		await FsUtil.createDirectory (Path.join (this.streamDataPath, App.StreamThumbnailPath));

		this.baseUrl = `${url.protocol}${App.DoubleSlash}${url.hostname}:${url.port}`;
		const playcmd = App.systemAgent.createCommand (SystemInterface.CommandId.GetHlsManifest, {
			streamId: this.configureMap.streamId
		});
		if (playcmd == null) {
			throw Error ("Failed to create GetHlsManifest command");
		}
		const manifest = await (new WebRequest (`${this.configureMap.streamUrl}?${SystemInterface.Constant.UrlQueryParameter}=${encodeURIComponent (JSON.stringify (playcmd))}`).get ());
		this.setPercentComplete (1);
		await this.fetchSegmentFiles (manifest);
		this.setPercentComplete (100);
		this.isSuccess = true;
	}

	async end () {
		if (this.isSuccess && (! this.isCancelled)) {
			return;
		}
		FsUtil.removeDirectory (this.streamDataPath, (err) => {
			if (err != null) {
				Log.debug (`${this.toString ()} failed to remove data directory; streamDataPath=${this.streamDataPath} err=${err}`);
			}
		});
	}

	// Fetch all segment files referenced in the provided HLS index data and store the resulting base index file
	async fetchSegmentFiles (hlsIndexData) {
		let segmentindex, stats, destfile, req;

		const hls = HlsIndexParser.parse (hlsIndexData);
		if ((hls == null) || (hls.segmentCount <= 0)) {
			throw Error ("Failed to parse stream index data");
		}
		this.progressPercentDelta = (99 / hls.segmentCount);
		const recordparams = {
			id: this.configureMap.cacheStreamId,
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

		segmentindex = 0;
		for (const file of hls.segmentFilenames) {
			req = new WebRequest (`${this.baseUrl}${file}`);
			req.savePath = Path.join (this.streamDataPath, App.StreamHlsPath, `${segmentindex}.ts`);
			destfile = await req.get ();
			stats = await FsUtil.statFile (destfile);
			recordparams.size += stats.size;

			const cmd = App.systemAgent.createCommand (SystemInterface.CommandId.GetThumbnailImage, {
				id: this.configureMap.streamId,
				thumbnailIndex: segmentindex
			});
			if (cmd == null) {
				throw Error ("Failed to create GetThumbnailImage command");
			}
			req = new WebRequest (`${this.configureMap.thumbnailUrl}?${SystemInterface.Constant.UrlQueryParameter}=${encodeURIComponent (JSON.stringify (cmd))}`);
			req.savePath = Path.join (this.streamDataPath, App.StreamThumbnailPath, `${segmentindex}.jpg`);
			destfile = await req.get ();
			stats = await FsUtil.statFile (destfile);
			recordparams.size += stats.size;
			this.addPercentComplete (this.progressPercentDelta);
			recordparams.segmentFilenames.push (`${segmentindex}.ts`);
			++segmentindex;
		}

		const record = App.systemAgent.createCommand (SystemInterface.CommandId.StreamItem, recordparams);
		if (record == null) {
			throw Error ("Failed to create StreamItem record");
		}
		await FsUtil.writeFile (Path.join (this.streamDataPath, App.StreamRecordFilename), JSON.stringify (record));
	}
}
module.exports = CacheMediaStreamTask;
