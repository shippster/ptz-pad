/*
 * NDI PTZ support for PTZ Pad.
 *
 * Talks to the free NDI Runtime (installed with NDI Tools from ndi.video)
 * through koffi, a prebuilt FFI library, so nothing needs compiling.
 * Commands go over the camera's own NDI connection using a metadata-only
 * receiver: no video is decoded.
 */
const path = require('path');
const fs = require('fs');

let koffi = null;
let fn = null;          // bound NDI functions
let loadedPath = null;
let finder = null;
let finderIps = null;
let structsDone = false;
const receivers = new Map(); // source name -> { inst, ptz, timer, failedAt }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function candidates(custom) {
  const list = [];
  if (custom) list.push(custom);
  const local = path.join(__dirname, 'runtime', 'ndi');
  const envDirs = ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5', 'NDI_RUNTIME_DIR_V4'].map((k) => process.env[k]).filter(Boolean);
  if (process.platform === 'win32') {
    const dll = process.arch === 'arm64' ? 'Processing.NDI.Lib.arm64.dll' : 'Processing.NDI.Lib.x64.dll';
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    list.push(
      ...envDirs.map((d) => path.join(d, dll)),
      path.join(pf, 'NDI', 'NDI 6 Runtime', 'v6', dll),
      path.join(pf, 'NDI', 'NDI 5 Runtime', 'v5', dll),
      path.join(local, dll),
      dll, // anywhere on PATH
    );
  } else if (process.platform === 'darwin') {
    list.push(
      ...envDirs.map((d) => path.join(d, 'libndi.dylib')),
      path.join(local, 'libndi.dylib'),
      '/usr/local/lib/libndi.dylib',
      '/usr/local/lib/libndi.6.dylib',
      '/usr/local/lib/libndi.5.dylib',
      '/Library/NDI SDK for Apple/lib/macOS/libndi.dylib',
      '/Library/NDI 6 SDK/lib/macOS/libndi.dylib',
    );
  } else {
    list.push(
      ...envDirs.map((d) => path.join(d, 'libndi.so')),
      path.join(local, 'libndi.so'),
      'libndi.so.6', 'libndi.so.5', 'libndi.so',
      '/usr/lib/libndi.so', '/usr/local/lib/libndi.so',
    );
  }
  return list;
}

class NdiError extends Error {}

function load(custom) {
  if (fn) return;
  try { koffi = koffi || require('koffi'); } catch (e) {
    throw new NdiError("NDI support isn't installed yet. Run the Start PTZ Pad launcher again to finish setup.");
  }
  let lib = null, lastErr = null;
  for (const p of candidates(custom)) {
    if (path.isAbsolute(p) && !fs.existsSync(p)) continue;
    try { lib = koffi.load(p); loadedPath = p; break; } catch (e) { lastErr = e; }
  }
  if (!lib) {
    throw new NdiError(custom && lastErr
      ? `Couldn't open the NDI library at ${custom}: ${lastErr.message}`
      : 'NDI Runtime not found. Install NDI Tools (free from ndi.video), then restart PTZ Pad.');
  }

  if (!structsDone) {
  structsDone = true;
  koffi.struct('NDIlib_source_t', { p_ndi_name: 'const char *', p_url_address: 'const char *' });
  koffi.struct('NDIlib_find_create_t', { show_local_sources: 'bool', p_groups: 'const char *', p_extra_ips: 'const char *' });
  koffi.struct('NDIlib_recv_create_v3_t', {
    source_to_connect_to: 'NDIlib_source_t',
    color_format: 'int',
    bandwidth: 'int',
    allow_video_fields: 'bool',
    p_ndi_recv_name: 'const char *',
  });
  koffi.struct('NDIlib_video_frame_v2_t', {
    xres: 'int', yres: 'int', FourCC: 'uint32_t',
    frame_rate_N: 'int', frame_rate_D: 'int',
    picture_aspect_ratio: 'float', frame_format_type: 'int',
    timecode: 'int64_t', p_data: 'uint8_t *', line_stride_in_bytes: 'int',
    p_metadata: 'const char *', timestamp: 'int64_t',
  });
  }

  fn = {
    initialize: lib.func('bool NDIlib_initialize()'),
    destroy: lib.func('void NDIlib_destroy()'),
    version: lib.func('const char *NDIlib_version()'),
    findCreate: lib.func('void *NDIlib_find_create_v2(const NDIlib_find_create_t *p_create_settings)'),
    findDestroy: lib.func('void NDIlib_find_destroy(void *p_instance)'),
    findSources: lib.func('void *NDIlib_find_get_current_sources(void *p_instance, _Out_ uint32_t *p_no_sources)'),
    recvCreate: lib.func('void *NDIlib_recv_create_v3(const NDIlib_recv_create_v3_t *p_create_settings)'),
    recvDestroy: lib.func('void NDIlib_recv_destroy(void *p_instance)'),
    recvCapture: lib.func('int NDIlib_recv_capture_v2(void *p_instance, void *p_video, void *p_audio, void *p_metadata, uint32_t timeout_in_ms)'),
    recvConnections: lib.func('int NDIlib_recv_get_no_connections(void *p_instance)'),
    ptzSupported: lib.func('bool NDIlib_recv_ptz_is_supported(void *p_instance)'),
    panTiltSpeed: lib.func('bool NDIlib_recv_ptz_pan_tilt_speed(void *p_instance, float pan_speed, float tilt_speed)'),
    panTilt: lib.func('bool NDIlib_recv_ptz_pan_tilt(void *p_instance, float pan_value, float tilt_value)'),
    zoomSpeed: lib.func('bool NDIlib_recv_ptz_zoom_speed(void *p_instance, float zoom_speed)'),
    focusSpeed: lib.func('bool NDIlib_recv_ptz_focus_speed(void *p_instance, float focus_speed)'),
    autoFocus: lib.func('bool NDIlib_recv_ptz_auto_focus(void *p_instance)'),
    storePreset: lib.func('bool NDIlib_recv_ptz_store_preset(void *p_instance, int preset_no)'),
    recallPreset: lib.func('bool NDIlib_recv_ptz_recall_preset(void *p_instance, int preset_no, float speed)'),
    captureVideo: lib.func('int NDIlib_recv_capture_v2(void *p_instance, _Out_ NDIlib_video_frame_v2_t *p_video, void *p_audio, void *p_metadata, uint32_t timeout_in_ms)'),
    freeVideo: lib.func('void NDIlib_recv_free_video_v2(void *p_instance, const NDIlib_video_frame_v2_t *p_video_data)'),
  };
  if (!fn.initialize()) { fn = null; throw new NdiError("The NDI Runtime is installed but wouldn't start. This processor may not be supported."); }
}

/* ---------- discovery ---------- */
function currentSources() {
  const n = [0];
  const ptr = fn.findSources(finder, n);
  if (!ptr || !n[0]) return [];
  return koffi.decode(ptr, 'NDIlib_source_t', n[0]).map((s) => ({ name: s.p_ndi_name, address: s.p_url_address || '' }));
}

async function sources({ extraIps = '' } = {}) {
  if (!finder || finderIps !== extraIps) {
    if (finder) fn.findDestroy(finder);
    finder = fn.findCreate({ show_local_sources: true, p_groups: null, p_extra_ips: extraIps || null });
    finderIps = extraIps;
    if (!finder) throw new NdiError("Couldn't start NDI discovery.");
  }
  // Discovery runs on NDI's own threads; poll without blocking the app.
  let list = currentSources();
  for (let waited = 0; waited < 3000; waited += 250) {
    await sleep(250);
    const next = currentSources();
    if (next.length > list.length) list = next;
    else if (list.length && waited >= 1000) break;
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- PTZ ---------- */
function pump(r) {
  try {
    fn.recvCapture(r.inst, null, null, null, 0); // processes status and PTZ capability messages
    r.ptz = fn.ptzSupported(r.inst);
  } catch (e) { /* receiver may be closing */ }
}

async function receiver(name) {
  let r = receivers.get(name);
  if (!r) {
    const inst = fn.recvCreate({
      source_to_connect_to: { p_ndi_name: name, p_url_address: null },
      color_format: 0,
      bandwidth: -10, // metadata only: no video or audio
      allow_video_fields: false,
      p_ndi_recv_name: 'PTZ Pad',
    });
    if (!inst) throw new NdiError("Couldn't create an NDI connection.");
    r = { inst, ptz: false, failedAt: 0 };
    r.timer = setInterval(() => pump(r), 100);
    receivers.set(name, r);
  }
  if (r.ptz) return r;
  if (Date.now() - r.failedAt < 5000) throw new NdiError(`${name} isn't answering PTZ commands yet.`);
  for (let t = 0; t < 4000 && !r.ptz; t += 100) { pump(r); if (!r.ptz) await sleep(100); }
  if (!r.ptz) {
    r.failedAt = Date.now();
    const connected = fn.recvConnections(r.inst) > 0;
    throw new NdiError(connected
      ? `${name} is connected but doesn't offer PTZ control over NDI. Turn on NDI PTZ in the camera settings, or use VISCA.`
      : `Couldn't connect to ${name}. Check the source name matches exactly and the camera is on the network.`);
  }
  return r;
}

async function ptz({ source, op, pan = 0, tilt = 0, v = 0, n = 0 } = {}) {
  if (!source) throw new NdiError('Pick the NDI source for this camera.');
  const num = (x, lo, hi) => Math.max(lo, Math.min(hi, Number(x) || 0));
  if (op === 'manual') return true; // NDI switches to manual focus when focus speed is sent
  const { inst } = await receiver(String(source));
  switch (op) {
    case 'pt': return fn.panTiltSpeed(inst, num(pan, -1, 1), num(tilt, -1, 1));
    case 'zoom': return fn.zoomSpeed(inst, num(v, -1, 1));
    case 'focus': return fn.focusSpeed(inst, num(v, -1, 1));
    case 'autofocus': return fn.autoFocus(inst);
    case 'recall': return fn.recallPreset(inst, num(n, 0, 99) | 0, 1);
    case 'store': return fn.storePreset(inst, num(n, 0, 99) | 0);
    case 'home': return fn.panTilt(inst, 0, 0);
    default: throw new NdiError(`Unknown NDI command ${op}`);
  }
}

/* ---------- video for auto-tracking ---------- */
const FOURCC = { RGBA: 0x41424752, RGBX: 0x58424752, BGRA: 0x41524742, BGRX: 0x58524742, UYVY: 0x59565955 };

/*
 * Copies frame memory owned by NDI into a buffer we own.
 * Never wrap NDI's memory directly (koffi.view): Electron forbids buffers that
 * point at outside memory and kills the process when one is made.
 */
let memcpy;          // undefined: not looked up yet; null: unavailable
let copyBuf = null;
const decodeTypes = new Map();
function getMemcpy() {
  if (memcpy !== undefined) return memcpy;
  memcpy = null;
  const libs = process.platform === 'win32' ? ['msvcrt.dll', 'ucrtbase.dll']
    : process.platform === 'darwin' ? ['libSystem.B.dylib', '/usr/lib/libSystem.B.dylib'] : ['libc.so.6', 'libc.so'];
  for (const name of libs) {
    try { memcpy = koffi.load(name).func('void memcpy(void *dst, const void *src, size_t n)'); break; } catch (e) { /* try the next */ }
  }
  return memcpy;
}
function frameBytes(ptr, len) {
  const mc = getMemcpy();
  if (mc) {
    if (!copyBuf || copyBuf.length < len) copyBuf = Buffer.alloc(len);
    mc(copyBuf, ptr, len);
    return copyBuf; // reused for the next frame; downscale reads it right away
  }
  let t = decodeTypes.get(len);
  if (!t) { t = koffi.array('uint8_t', len, 'Typed'); decodeTypes.clear(); decodeTypes.set(len, t); }
  return koffi.decode(ptr, t); // a copy
}

// Copies a frame into a small RGBA image (nearest neighbour), maxWidth wide at most.
function downscale(vf, maxWidth) {
  const w = vf.xres, h = vf.yres;
  if (!w || !h || !vf.p_data) return null;
  const four = vf.FourCC >>> 0;
  const bgr = four === FOURCC.BGRA || four === FOURCC.BGRX;
  const uyvy = four === FOURCC.UYVY;
  if (!bgr && !uyvy && four !== FOURCC.RGBA && four !== FOURCC.RGBX) return { unsupported: four };
  const stride = vf.line_stride_in_bytes || w * (uyvy ? 2 : 4);
  const src = frameBytes(vf.p_data, stride * h);
  const scale = Math.min(1, maxWidth / w);
  const ow = Math.max(1, Math.round(w * scale)), oh = Math.max(1, Math.round(h * scale));
  const out = new Uint8Array(ow * oh * 4);
  let o = 0;
  for (let y = 0; y < oh; y++) {
    const row = Math.min(h - 1, Math.floor(y / scale)) * stride;
    for (let x = 0; x < ow; x++) {
      const sx = Math.min(w - 1, Math.floor(x / scale));
      if (uyvy) {
        const i = row + (sx >> 1) * 4;
        const Y = src[i + 1 + (sx & 1) * 2] - 16, U = src[i] - 128, V = src[i + 2] - 128;
        out[o] = clamp8(1.164 * Y + 1.793 * V);
        out[o + 1] = clamp8(1.164 * Y - 0.213 * U - 0.533 * V);
        out[o + 2] = clamp8(1.164 * Y + 2.112 * U);
      } else {
        const i = row + sx * 4;
        out[o] = src[i + (bgr ? 2 : 0)];
        out[o + 1] = src[i + 1];
        out[o + 2] = src[i + (bgr ? 0 : 2)];
      }
      out[o + 3] = 255;
      o += 4;
    }
  }
  return { w: ow, h: oh, data: out };
}
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/*
 * Starts pulling the lowest-bandwidth video from an NDI source.
 * onFrame({w, h, data}) gets at most one frame each time handle.want is true;
 * frames arriving meanwhile are dropped so tracking never falls behind.
 */
function videoStart({ source, libPath = '', maxWidth = 480 } = {}, onFrame) {
  load(libPath);
  if (!source) throw new NdiError('Choose the NDI video to track in this camera\u2019s settings.');
  const inst = fn.recvCreate({
    source_to_connect_to: { p_ndi_name: String(source), p_url_address: null },
    color_format: 2,  // RGBX_RGBA
    bandwidth: 0,     // lowest: the small preview stream when the camera offers one
    allow_video_fields: false,
    p_ndi_recv_name: 'PTZ Pad tracking',
  });
  if (!inst) throw new NdiError("Couldn't open the NDI video for tracking.");
  const h = { inst, want: true, frames: 0, lastFrameAt: 0, lastSentAt: 0, unsupported: null, error: '', timer: null };
  h.timer = setInterval(() => {
    for (let k = 0; k < 6; k++) {
      const vf = {};
      let type;
      try { type = fn.captureVideo(inst, vf, null, null, 0); } catch (e) { return; }
      if (type !== 1) break; // 1 = video frame
      try {
        h.frames++; h.lastFrameAt = Date.now();
        if (h.want) {
          const fr = downscale(vf, maxWidth);
          if (fr && fr.unsupported) h.unsupported = fr.unsupported;
          else if (fr) { h.want = false; h.lastSentAt = Date.now(); onFrame(fr); }
        }
      } catch (e) {
        h.error = `Couldn\u2019t read the NDI video: ${e.message}`;
      } finally { fn.freeVideo(inst, vf); }
    }
  }, 15);
  return h;
}

function videoStop(h) {
  if (!h) return;
  clearInterval(h.timer);
  try { fn.recvDestroy(h.inst); } catch (e) {}
}

/* ---------- public API: always resolves to {ok, ...} ---------- */
async function handle(args = {}) {
  try {
    load(args.libPath || '');
    if (args.action === 'status') return { ok: true, version: fn.version(), path: loadedPath };
    if (args.action === 'sources') return { ok: true, sources: await sources(args) };
    if (args.action === 'ptz') {
      const accepted = await ptz(args);
      return accepted ? { ok: true } : { ok: false, error: 'the camera turned down the command' };
    }
    return { ok: false, error: 'unknown NDI action' };
  } catch (e) {
    return { ok: false, error: e instanceof NdiError ? e.message : `NDI error: ${e.message}` };
  }
}

function close() {
  for (const r of receivers.values()) { clearInterval(r.timer); try { fn.recvDestroy(r.inst); } catch (e) {} }
  receivers.clear();
  if (finder) { try { fn.findDestroy(finder); } catch (e) {} finder = null; }
  if (fn) { try { fn.destroy(); } catch (e) {} }
}

module.exports = { handle, close, videoStart, videoStop, NdiError, _downscale: downscale };
