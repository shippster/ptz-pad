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

console.log(`Built PTZ Pad ${version} web version in _site/`);
