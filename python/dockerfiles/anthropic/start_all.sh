#!/bin/bash

set -e

export DISPLAY=:${DISPLAY_NUM}

/root/xvfb_startup.sh
/root/tint2_startup.sh
/root/mutter_startup.sh
/root/x11vnc_startup.sh
