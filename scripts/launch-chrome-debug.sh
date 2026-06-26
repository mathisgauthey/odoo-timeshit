#!/bin/bash
# Launches Chrome with the Odoo extension loaded and remote debugging enabled on port 9222.
# Step 1: run this script.
# Step 2: start "2. Debug Chrome Extension" in Rider to attach the JetBrains debugger.

EXTENSION_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_DIR="/tmp/chrome-odoo-timeshit-debug"
DEBUG_PORT=9222

CHROME=$(command -v google-chrome || command -v google-chrome-stable || command -v chromium-browser || command -v chromium 2>/dev/null)

if [ -z "$CHROME" ]; then
  echo "ERROR: Chrome/Chromium not found. Install Google Chrome and ensure it is on your PATH."
  exit 1
fi

echo "Extension dir : $EXTENSION_DIR"
echo "Debug port    : $DEBUG_PORT"
echo "Profile dir   : $PROFILE_DIR"
echo "Browser       : $CHROME"
echo ""

"$CHROME" \
  --remote-debugging-port=$DEBUG_PORT \
  --user-data-dir="$PROFILE_DIR" \
  chrome://extensions/ &

echo "Chrome launched (PID: $!). Now start '2. Debug Chrome Extension' in Rider."
