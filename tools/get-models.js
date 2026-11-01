// Downloads the on-device pose model used for auto-tracking (runs after npm install).
// Never fails the install: without the model everything except tracking still works.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'models');
const file = path.join(dir, 'pose_landmarker_lite.task');
const urls = [
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
];

// Marks this install as complete for the launchers, so they know when an
// update needs npm install again (the marker is named after the version).
try {
  const pkg = require('../package.json');
  const v = pkg.ptzpadInstall || pkg.version; // install generation, not the app version
  const nm = path.join(__dirname, '..', 'node_modules');
  for (const f of fs.readdirSync(nm)) if (f.startsWith('.ptz-pad-')) fs.unlinkSync(path.join(nm, f));
  fs.writeFileSync(path.join(nm, `.ptz-pad-${v}`), '');
} catch (e) { /* not fatal */ }

(async () => {
  if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) return;
  fs.mkdirSync(dir, { recursive: true });
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1_000_000) continue;
      fs.writeFileSync(file + '.part', buf);
      fs.renameSync(file + '.part', file);
      console.log(' Downloaded the auto-tracking model.');
      return;
    } catch (e) { /* try the next address */ }
  }
  console.warn(" Couldn't download the auto-tracking model. Tracking will be unavailable until you run the launcher again with internet.");
})();
