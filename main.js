const { app, BrowserWindow, ipcMain, shell, Menu, protocol, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const bridge = require('./bridge-core');
const ndi = require('./ndi-core');
const video = require('./video-core');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.log('PTZ Pad is already running, so this copy is switching to it.');
  app.quit();
}

// ptzpad://app/... serves files from this folder, so the tracker can load its
// model and WebAssembly (which browsers refuse to fetch from file:// pages).
protocol.registerSchemesAsPrivileged([
  { scheme: 'ptzpad', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream' };
const MODEL = path.join(__dirname, 'models', 'pose_landmarker_lite.task');

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 620,
    title: 'PTZ Pad',
    backgroundColor: '#1c2127',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep the control loop steady
    },
  });
  win.loadFile(path.join(__dirname, 'app', 'ptz-controller.html'));
  // Open any external link in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); } });
  // Closing the main window quits PTZ Pad, even while the hidden tracker window is open.
  win.on('closed', () => { win = null; app.quit(); });
}

/* ---------- camera commands ---------- */
ipcMain.handle('ptz:visca', (_e, args) => bridge.visca(args));
ipcMain.handle('ptz:http', (_e, args) => bridge.http(args));
ipcMain.handle('ptz:ndi', (_e, args) => ndi.handle(args));

/* ---------- auto-tracking ---------- */
const tracks = new Map(); // camera id -> { h: frame state mirrored from the video process, args, kind, startedAt, warned }

/* Tracking video (NDI and RTSP/SRT) runs in a separate background process, so a
   crash in native video code can never take down the app or camera control. */
let worker = null;
const workerExits = [];
const pendingStarts = new Map(); // id -> resolve
function getWorker() {
  if (worker) return worker;
  worker = utilityProcess.fork(path.join(__dirname, 'video-worker.js'), [], { serviceName: 'PTZ Pad tracking video', stdio: 'inherit' });
  worker.on('message', onWorkerMessage);
  worker.on('exit', onWorkerExit);
  return worker;
}
function onWorkerMessage(m) {
  if (!m) return;
  if (m.type === 'started') { const r = pendingStarts.get(m.id); if (r) { pendingStarts.delete(m.id); r(m); } return; }
  const t = tracks.get(m.id);
  if (!t) return;
  if (m.type === 'frame') {
    t.h.want = false; t.h.lastSentAt = Date.now();
    if (tracker && !tracker.isDestroyed()) tracker.webContents.send('track:frame', { id: m.id, w: m.w, h: m.h, data: m.data });
  } else if (m.type === 'status') {
    t.h.frames = m.frames; t.h.lastFrameAt = m.lastFrameAt; t.h.error = m.error; t.h.unsupported = m.unsupported;
  }
}
function onWorkerExit(code) {
  worker = null;
  for (const [id, r] of pendingStarts) r({ ok: false, error: 'The tracking video process stopped while starting.' });
  pendingStarts.clear();
  if (!tracks.size || quitting) return;
  const now = Date.now();
  workerExits.push(now);
  while (workerExits.length && workerExits[0] < now - 60000) workerExits.shift();
  if (workerExits.length > 3) {
    // Keeps crashing: give up on tracking, leave everything else running.
    for (const id of [...tracks.keys()]) {
      stopTrack(id);
      toPage({ id, found: false, fatal: true, error: 'Auto-tracking stopped because the tracking video kept crashing. Camera control still works. Please report this camera model.' });
    }
    return;
  }
  console.error(`[ptz-pad] tracking video process exited (${code}); restarting`);
  for (const [id, t] of tracks) {
    toPage({ id, found: false, error: 'The tracking video stopped unexpectedly. Restarting it\u2026' });
    t.h = freshFrameState(); t.startedAt = now; t.warned = false; t.lastErr = '';
    getWorker().postMessage({ type: 'start', id, ...t.args });
  }
}
const freshFrameState = () => ({ want: true, frames: 0, lastFrameAt: 0, lastSentAt: 0, error: '', unsupported: null });
function wantFrame(id, t) { t.h.want = true; if (worker && t.kind !== 'local') worker.postMessage({ type: 'want', id }); }
let quitting = false;
let tracker = null;
let trackerReady = null;

function startTracker() {
  if (tracker && !tracker.isDestroyed()) return trackerReady;
  tracker = new BrowserWindow({
    show: false,
    width: 640,
    height: 400,
    webPreferences: {
      preload: path.join(__dirname, 'tracker', 'tracker-preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  tracker.on('closed', () => { tracker = null; trackerReady = null; });
  trackerReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The tracking engine took too long to start.')), 30000);
    ipcMain.once('track:ready', (_e, info) => {
      clearTimeout(timer);
      if (info && info.error) reject(new Error(info.error)); else resolve();
    });
  }).catch((e) => { if (tracker && !tracker.isDestroyed()) tracker.destroy(); throw e; });
  tracker.loadURL('ptzpad://app/tracker/tracker.html');
  return trackerReady;
}

const toPage = (msg) => { if (win && !win.isDestroyed()) win.webContents.send('track:update', msg); };

function stopTrack(id) {
  const t = tracks.get(id);
  if (!t) return;
  tracks.delete(id);
  if (worker) worker.postMessage({ type: 'stop', id });
  if (tracker && !tracker.isDestroyed()) tracker.webContents.send('track:stop', { id });
}

ipcMain.handle('track:start', async (_e, { id, source, url, transport, libPath, local } = {}) => {
  try {
    if (!fs.existsSync(MODEL)) {
      return { ok: false, error: 'The auto-tracking model is missing. Run the Start PTZ Pad launcher again with internet on, then restart PTZ Pad.' };
    }
    await startTracker();
    stopTrack(id);
    if (local) { // USB and built-in cameras: the page sends frames itself (track:push)
      tracks.set(id, { h: freshFrameState(), args: { local: true }, kind: 'local', startedAt: Date.now(), warned: false, lastErr: '' });
      return { ok: true };
    }
    const args = url ? { url, transport } : { source, libPath };
    tracks.set(id, { h: freshFrameState(), args, kind: url ? 'stream' : 'ndi', startedAt: Date.now(), warned: false, lastErr: '' });
    const res = await new Promise((resolve) => {
      pendingStarts.set(id, resolve);
      getWorker().postMessage({ type: 'start', id, ...args });
      setTimeout(() => { if (pendingStarts.get(id) === resolve) { pendingStarts.delete(id); resolve({ ok: false, error: 'The tracking video took too long to start.' }); } }, 15000);
    });
    if (!res.ok) { stopTrack(id); return { ok: false, error: res.error }; }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.on('track:push', (_e, f) => {
  const t = f && tracks.get(f.id);
  if (!t || t.kind !== 'local') return;
  t.h.frames++; t.h.lastFrameAt = Date.now();
  if (!t.h.want || !tracker || tracker.isDestroyed()) return; // the tracker is still busy with the last frame: skip this one
  t.h.want = false; t.h.lastSentAt = Date.now();
  tracker.webContents.send('track:frame', { id: f.id, w: f.w, h: f.h, data: f.data });
});
ipcMain.handle('track:stop', (_e, { id } = {}) => { stopTrack(id); return { ok: true }; });
ipcMain.handle('stream:test', (_e, args) => video.snapshot(args));
ipcMain.on('track:lock', (_e, m) => { if (tracker && !tracker.isDestroyed()) tracker.webContents.send('track:lock', m); });
ipcMain.on('track:result', (_e, r) => {
  const t = r && tracks.get(r.id);
  if (!t) return;
  wantFrame(r.id, t); // ready for the next frame
  toPage(r);
});
// Watchdog: explain missing video, and recover if a frame result never came back.
setInterval(() => {
  const now = Date.now();
  for (const [id, t] of tracks) {
    if (t.kind === 'stream') {
      // Stream problems change over time (lost, reconnecting, back), so report each new one.
      const stale = t.h.lastFrameAt && now - t.h.lastFrameAt > 3000;
      let err = t.h.error ? `${t.h.error} Retrying\u2026` : '';
      if (!err && !t.h.frames && now - t.startedAt > 8000) err = 'No video from that stream yet. Check the address in this camera\u2019s settings.';
      if (!err && stale) err = 'The stream stopped sending video. Waiting for it\u2026';
      if (err && err !== t.lastErr) toPage({ id, found: false, error: err });
      t.lastErr = err;
    } else if (!t.h.frames && now - t.startedAt > 5000 && !t.warned) {
      t.warned = true;
      toPage({ id, found: false, error: t.kind === 'local' ? 'No picture from that USB camera yet. Check it\u2019s plugged in and not in use by another app.' : 'No video from that NDI source yet. Check the name in this camera\u2019s settings.' });
    }
    if (t.h.unsupported && !t.warned) {
      t.warned = true;
      toPage({ id, found: false, error: 'This camera sends a video format PTZ Pad can\u2019t read for tracking.' });
    }
    if (t.kind === 'ndi' && t.h.error && t.h.error !== t.lastErr) { toPage({ id, found: false, error: t.h.error }); t.lastErr = t.h.error; }
    if (!t.h.want && now - t.h.lastSentAt > 2000) wantFrame(id, t);
  }
}, 1000);

/* ---------- app lifecycle ---------- */
app.on('second-instance', () => {
  // Launched again while running: show this copy (and reopen its window if it was closed).
  if (!win) { if (app.isReady()) createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});
app.whenReady().then(() => {
  if (!gotLock) return; // another copy is running; this one is quitting
  protocol.handle('ptzpad', async (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(__dirname, rel));
    if (!file.startsWith(__dirname + path.sep)) return new Response('Not allowed', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
  });
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  // The installable web version (GitHub Pages) sends its commands to http://localhost:8787.
  // Running the bridge here means installing PTZ Pad is all that page needs. This computer only.
  require('./bridge-server').start({ host: '127.0.0.1' }).then((s) => { webBridge = s; });
});
let webBridge = null;
function shutdown() {
  if (quitting) return;
  quitting = true;
  for (const id of [...tracks.keys()]) stopTrack(id);
  if (worker) { try { worker.kill(); } catch (e) {} }
  if (webBridge) { try { webBridge.close(); } catch (e) {} }
  bridge.close();
  ndi.close();
}
app.on('before-quit', shutdown);
app.on('window-all-closed', () => {
  shutdown();
  app.quit();
});
