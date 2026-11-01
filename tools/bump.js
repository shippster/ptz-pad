#!/usr/bin/env node
/*
 * Starts a new version.
 *   node tools/bump.js 1.13.0     (or: patch | minor | major)
 * Sets package.json and APP_VERSION, and adds a CHANGELOG.md section to fill in.
 * Then write the notes, commit and push to main: GitHub builds the installers,
 * publishes the release and the web version, and the apps show the update notice.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const htmlPath = path.join(root, 'app', 'ptz-controller.html');
const logPath = path.join(root, 'CHANGELOG.md');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);
const arg = process.argv[2];
const next = { patch: `${ma}.${mi}.${pa + 1}`, minor: `${ma}.${mi + 1}.0`, major: `${ma + 1}.0.0` }[arg] || arg;
if (!/^\d+\.\d+\.\d+$/.test(next || '')) { console.error('Usage: node tools/bump.js 1.13.0 | patch | minor | major'); process.exit(1); }

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const html = fs.readFileSync(htmlPath, 'utf8');
fs.writeFileSync(htmlPath, html.replace(/const APP_VERSION = '[^']+'/, `const APP_VERSION = '${next}'`));

const log = fs.readFileSync(logPath, 'utf8');
if (!new RegExp(`^##\\s+v?${next.replace(/\./g, '\\.')}\\b`, 'm').test(log)) {
  const today = new Date().toISOString().slice(0, 10);
  const i = log.search(/^##\s/m);
  const entry = `## ${next} (${today})\n\n- \n\n`;
  fs.writeFileSync(logPath, i < 0 ? `${log.trimEnd()}\n\n${entry}` : log.slice(0, i) + entry + log.slice(i));
}
console.log(`Now at ${next}. Write the notes under "## ${next}" in CHANGELOG.md, then commit and push to main.`);
