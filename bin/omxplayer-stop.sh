#!/bin/sh

# Script that executes omxplayer to play a target
#
# Parameters are set using environment variables
#   SIGNAL_TYPE: The signal type to use for the stop (default TERM)

if [ -z "${SIGNAL_TYPE}" ]; then
	SIGNAL_TYPE="TERM"
fi

/usr/bin/killall -${SIGNAL_TYPE} omxplayer.bin
