#!/bin/sh

# Script that executes xset to activate the screen blank

if [ `uname` = 'Darwin' ]; then
	# Exit with no output
	exit 0
fi

DISPLAY=:0.0; export DISPLAY
xset s activate
