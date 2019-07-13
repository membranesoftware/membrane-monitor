#!/bin/sh

# Script that executes the chromium browser targeting a specified URL
#
# Parameters are set using environment variables
#   DISPLAY: The name of the display X server (defaults to :0.0)
#   TARGET_URL: The URL to display

if [ -z "${DISPLAY}" ]; then
	DISPLAY=":0.0"
fi
export DISPLAY

if [ -z "${TARGET_URL}" ]; then
	echo "Error: expected environment variables not provided (see comments in script $0)"
	exit 1
fi

CHROMIUM=/usr/bin/chromium-browser

COUNT=0
while (true); do
	PROCS=`ps --no-headers -C chromium-browse,chromium-browser-v7,chromium-browser | grep -v "<defunct>"`
	if [ ! -z "${PROCS}" ]; then
		# We assume that the chromium-stop.sh script has been executed, so only a
		# sleep is needed here (to wait for the process to end)
		sleep 1
	else
		break
	fi

	COUNT=`expr ${COUNT} + 1`
	if [ ${COUNT} = 15 ]; then
		# TODO: Possibly launch chromium anyway, instead of exiting
		exit 1
	fi
done

${CHROMIUM} --kiosk --user-data-dir=/tmp "${TARGET_URL}" &
