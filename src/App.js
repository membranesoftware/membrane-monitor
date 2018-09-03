// Object that holds global application state

"use strict";

exports.ENABLE_VERBOSE_LOGGING = false;
exports.VERSION = "0-ffffffff";

exports.BASE_DIRECTORY = process.cwd ();
exports.SOURCE_DIRECTORY = exports.BASE_DIRECTORY + "/src";
exports.DATA_DIRECTORY = exports.BASE_DIRECTORY + "/run";
exports.BIN_DIRECTORY = exports.BASE_DIRECTORY + "/bin";
exports.CONF_DIRECTORY = exports.BASE_DIRECTORY + "/conf";
exports.PERIODIC_LOG_INTERVAL = 15000; // milliseconds
exports.TASK_CONFIGURATION_FILE = "conf/task.conf";
exports.CONFIG_FILE = exports.BASE_DIRECTORY + "/conf/systemagent.conf";

exports.AGENT_DISPLAY_NAME = null;
exports.AGENT_APPLICATION_NAME = "Membrane Server";
exports.AGENT_ENABLED = true;
exports.URL_HOSTNAME = null;
exports.UDP_PORT = 63738;
exports.TCP_PORT = 63738;
exports.PUBLISH_STATUS_PERIOD = 60; // seconds
exports.MAX_TASK_COUNT = 4;
exports.LINK_SERVER_URL = "";
exports.FFMPEG_PATH = "";
exports.CURL_PATH = "";

exports.HEARTBEAT_PERIOD = 500; // milliseconds

global.App = exports;
