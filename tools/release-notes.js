#!/usr/bin/env node
/*
 * Reads one version's notes from CHANGELOG.md.
 *   node tools/release-notes.js            notes for the version in package.json
 *   node tools/release-notes.js 1.12.0     notes for that version
 * Prints the notes as Markdown (the lines under that version's heading).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function notesFor(version) {
  const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^##\\s+v?${version.replace(/\./g, '\\.')}\\b`).test(l));
  if (start < 0) return null;
  const head = lines[start];
  const date = (/\((\d{4}-\d{2}-\d{2})\)/.exec(head) || [])[1] || '';
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  const notes = lines.slice(start + 1, end).join('\n').trim();
  return { version, date, notes };
}

// Every version in CHANGELOG.md, newest first: [{ version, date, notes }]
function allNotes() {
  const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const versions = [...text.matchAll(/^##\s+v?(\d+\.\d+\.\d+)\b/gm)].map((m) => m[1]);
  return versions.map(notesFor).filter((r) => r && r.notes.replace(/[-*\s]/g, ''));
}

module.exports = { notesFor, allNotes };

if (require.main === module) {
  const v = process.argv[2] || require(path.join(root, 'package.json')).version;
  const r = notesFor(v);
  if (!r || !r.notes) { console.error(`CHANGELOG.md has no notes for ${v}.`); process.exit(1); }
  console.log(r.notes);
}
