## Membrane Monitor

A server application that executes in the [Node.js](https://nodejs.org/) runtime, targeting the Raspberry Pi OS platform.

Primary functions:
- Launch the [Chromium](https://www.chromium.org/Home) browser to display a particular web site, as specified by URL.
- Store a playlist of URLs and cycle Chromium through the list at regular intervals.
- Launch [omxplayer](https://www.raspberrypi.org/documentation/raspbian/applications/omxplayer.md) to display a particular video stream, as specified by URL.
- Store a playlist of video streams and cycle omxplayer through the list at regular intervals.
- Transfer stream data to local storage, enabling playback from a cache without network access.
- Accept commands received from the [Membrane Control](https://membranesoftware.com/membrane-control) interface.

Includes [Membrane Surface](https://github.com/membranesoftware/membrane-surface) as a component binary.

Builds: https://membranesoftware.com/membrane-monitor/

About Membrane Monitor: https://membranesoftware.com/i/about-membrane-monitor
