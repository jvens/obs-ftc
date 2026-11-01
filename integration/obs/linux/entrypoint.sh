#!/bin/sh
# Starts a virtual display, waits for it, then OBS with the arguments given.
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
export DISPLAY=:99
for _ in $(seq 1 50); do [ -e /tmp/.X11-unix/X99 ] && break; sleep 0.1; done
exec obs "$@"
