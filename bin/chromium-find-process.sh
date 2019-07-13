#!/bin/sh

# Script that prints "true" if a chromium browser process is running
#

PROCS=`ps --no-headers -C chromium-browse,chromium-browser-v7,chromium-browser | grep -v "<defunct>"`
if [ ! -z "${PROCS}" ]; then
	echo "true"
fi
exit 0
