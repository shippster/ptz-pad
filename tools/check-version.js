#!/usr/bin/env node
/*
 * Checks a release is consistent before it ships:
 *   package.json "version" = APP_VERSION in app/ptz-controller.html = a CHANGELOG.md entry with notes.
 * Prints the version on success.
 */
const fs = require('fs');
const path = require('path');
const { notesFor } = require('./release-notes');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json')).version;
const html = fs.readFileSync(path.join(root, 'app', 'ptz-controller.html'), 'utf8');
const app = (/const APP_VERSION = '([^']+)'/.exec(html) || [])[1];
const problems = [];
if (app !== pkg) problems.push(`APP_VERSION in app/ptz-controller.html is ${app}, but package.json says ${pkg}.`);
const n = notesFor(pkg);
if (!n || !n.notes.replace(/[-*\s]/g, '')) problems.push(`CHANGELOG.md needs a "## ${pkg} (YYYY-MM-DD)" section with notes.`);
if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  console.error('Fix with: node tools/bump.js ' + pkg);
  process.exit(1);
}
console.log(pkg);
