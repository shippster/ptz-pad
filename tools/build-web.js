#!/usr/bin/env node
/*
 * Builds the installable web version into _site/ for GitHub Pages:
 *   app/ptz-controller.html -> _site/index.html, plus web/ (manifest, service worker, icons).
 * Run with: npm run web
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, '_site');
const { version } = require(path.join(root, 'package.json'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'app', 'ptz-controller.html'), path.join(out, 'index.html'));
fs.cpSync(path.join(root, 'web'), out, { recursive: true });

// A new cache name per version, so installed copies pick up the new release.
const sw = path.join(out, 'sw.js');
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const CACHE = '[^']*'/, `const CACHE = 'ptz-pad-${version}'`));
fs.writeFileSync(path.join(out, '.nojekyll'), '');

// The update feed every copy of PTZ Pad checks: the latest version plus recent notes,
// so someone several versions behind sees everything they missed.
const { allNotes } = require('./release-notes');
const pkg = require(path.join(root, 'package.json'));
const repo = (pkg.repository && (pkg.repository.url || pkg.repository) || '').replace(/^.*github\.com[/:]|\.git$/g, '');
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({
  version,
  download: repo ? `https://github.com/${repo}/releases/latest` : '',
  releases: allNotes().slice(0, 10),
}, null, 2));

console.log(`Built PTZ Pad ${version} web version in _site/`);
