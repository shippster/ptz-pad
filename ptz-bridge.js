#!/usr/bin/env node
/*
 * Run PTZ Pad in Chrome or Edge instead of the desktop app, or give the
 * installable web version (GitHub Pages) a bridge on this computer.
 *   node ptz-bridge.js   then open http://localhost:8787
 * The desktop app runs the same bridge itself, so you don't need this while it's open.
 */
require('./bridge-server').start();
