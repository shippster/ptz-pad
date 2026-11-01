/*
 * PTZ Pad tracking video, in its own background process.
 *
 * NDI and FFmpeg video run here, not in the main app, so if either ever
 * crashes, camera control and the controller keep working and the app
 * restarts this process. Started by main.js with Electron's utilityProcess.
 *
 * In:  {type:'start', id, source|url, transport, libPath}, {type:'want', id}, {type:'stop', id}
 * Out: {type:'started', id, ok, error}, {type:'frame', id, w, h, data}, {type:'status', id, ...}
 */
const ndi = require('./ndi-core');
const video = require('./video-core');

const port = process.parentPort;
const jobs = new Map(); // id -> { h, stop }

function stop(id) {
  const j = jobs.get(id);
  if (!j) return;
  jobs.delete(id);
  try { j.stop(j.h); } catch (e) {}
}

port.on('message', (e) => {
  const m = e.data || {};
  if (m.type === 'start') {
    stop(m.id);
    try {
      const onFrame = (f) => port.postMessage({ type: 'frame', id: m.id, w: f.w, h: f.h, data: f.data });
      const h = m.url
        ? video.videoStart({ url: m.url, transport: m.transport }, onFrame)
        : ndi.videoStart({ source: m.source, libPath: m.libPath }, onFrame);
      jobs.set(m.id, { h, stop: m.url ? video.videoStop : ndi.videoStop });
      port.postMessage({ type: 'started', id: m.id, ok: true });
    } catch (err) {
      port.postMessage({ type: 'started', id: m.id, ok: false, error: err.message });
    }
  } else if (m.type === 'want') {
    const j = jobs.get(m.id);
    if (j) j.h.want = true;
  } else if (m.type === 'stop') {
    stop(m.id);
  }
});

setInterval(() => {
  for (const [id, { h }] of jobs) {
    port.postMessage({ type: 'status', id, frames: h.frames, lastFrameAt: h.lastFrameAt, error: h.error || '', unsupported: h.unsupported || null });
  }
}, 500);

process.on('uncaughtException', (e) => console.error('[ptz-pad video]', e));
