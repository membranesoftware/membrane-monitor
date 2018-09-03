#!/bin/sh

# Script that executes xset commands to disable screen blanking

if [ `uname` = 'Darwin' ]; then
	# Exit with no output
	exit 0
fi

DISPLAY=:0.0; export DISPLAY
xset s off
xset -dpms
xset s noblank
