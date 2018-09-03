#!/bin/sh

# Script that executes omxplayer to play a target
#
# Parameters are set using environment variables
#   TARGET_MEDIA: The URL or path for the media to play
#   WORKING_DIR: The working directory to use for omxplayer

if [ -z "${TARGET_MEDIA}" -o -z "${WORKING_DIR}" ]; then
	echo "Error: expected environment variables not provided (see comments in script $0)"
	exit 1
fi

OMXPLAYER=/usr/bin/omxplayer

if [ ! -x "${OMXPLAYER}" ]; then
	echo "Error: omxplayer executable not found at \"${OMXPLAYER}\""
	exit 1
fi

cd "${WORKING_DIR}" && "${OMXPLAYER}" "${TARGET_MEDIA}"
