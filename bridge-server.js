/*
 * PTZ Pad bridge server, shared by ptz-bridge.js and the desktop app.
 * Serves the controller page and its web-app files, and carries camera commands
 * (VISCA, HTTP, NDI) for PTZ Pad running in a browser, including the installable
 * web version on GitHub Pages.
 *
 * Only these web pages may send commands:
 *   - pages served by this bridge
 *   - http://localhost and http://127.0.0.1 on any port
 *   - the "homepage" address in package.json (your GitHub Pages site)
 *   - anything listed in the PTZ_PAD_ORIGINS environment variable, comma separated
 * Every other website is refused, so a page you happen to visit can't move your cameras
 * or use the bridge to reach other devices on your network.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const bridge = require('./bridge-core');
const ndi = require('./ndi-core');

const HTML = path.join(__dirname, 'app', 'ptz-controller.html');
const WEB = path.join(__dirname, 'web');

const TYPES = {
  '.webmanifest': 'application/manifest+json',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const ORIGINS = new Set((process.env.PTZ_PAD_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean));
try {
  const home = require('./package.json').homepage;
  if (home) ORIGINS.add(new URL(home).origin);
} catch (e) { /* no homepage set */ }

function originAllowed(origin, host) {
  if (!origin) return true; // same-page requests and tools like curl
  let u;
  try { u = new URL(origin); } catch (e) { return false; }
  if (u.host === host) return true; // a page this bridge served
  if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return true;
  return ORIGINS.has(u.origin);
}

function send(res, code, body, type = 'application/json', origin = '') {
  const head = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (origin) {
    head['Access-Control-Allow-Origin'] = origin;
    head['Access-Control-Allow-Headers'] = '*';
    head['Access-Control-Allow-Private-Network'] = 'true';
    head.Vary = 'Origin';
  }
  res.writeHead(code, head);
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function staticFile(pathname) {
  const rel = path.normalize(pathname).replace(/^([/\\])+/, '');
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB + path.sep)) return null;
  const type = TYPES[path.extname(file)];
  if (!type || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return { body: fs.readFileSync(file), type };
}

function handler(req, res) { return handle(req, res).catch((e) => { try { send(res, 500, { ok: false, error: String(e && e.message || e) }); } catch (_) {} }); }
async function handle(req, res) {
  const u = new URL(req.url, 'http://localhost');
  const q = Object.fromEntries(u.searchParams);
  const origin = req.headers.origin || '';
  if (!originAllowed(origin, req.headers.host)) {
    console.warn(`Refused a request from ${origin}. To allow it, add it to PTZ_PAD_ORIGINS or package.json "homepage".`);
    return send(res, 403, { ok: false, error: `this bridge doesn't accept commands from ${origin}` });
  }
  const allow = origin || '';
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain', allow);
  if (u.pathname === '/' || u.pathname === '/index.html') return send(res, 200, fs.readFileSync(HTML), 'text/html; charset=utf-8', allow);
  if (u.pathname === '/ping') return send(res, 200, { ok: true, bridge: 'ptz-pad', version: 1 }, 'application/json', allow);
  if (u.pathname === '/visca') { const r = await bridge.visca(q); return send(res, r.ok ? 200 : 502, r, 'application/json', allow); }
  if (u.pathname === '/http') return send(res, 200, await bridge.http(q), 'application/json', allow);
  if (u.pathname === '/ndi') {
    let args = {};
    try { args = JSON.parse(q.q || '{}'); } catch (e) { return send(res, 400, { ok: false, error: 'bad request' }, 'application/json', allow); }
    return send(res, 200, await ndi.handle(args), 'application/json', allow);
  }
  const file = staticFile(u.pathname);
  if (file) return send(res, 200, file.body, file.type, allow);
  send(res, 404, { ok: false, error: 'not found' }, 'application/json', allow);
}

/** Start the bridge. Resolves with the server, or with null if the port is taken
 *  (another copy of PTZ Pad or the bridge is already running, which is fine). */
//  host: leave unset to accept other devices on the network (the standalone bridge);
//  '127.0.0.1' keeps it to this computer (the desktop app).
function start({ port = Number(process.env.PORT) || 8787, host, quiet = false } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.once('error', (e) => {
      if (!quiet) console.warn(e.code === 'EADDRINUSE' ? `Port ${port} is already in use, so this bridge isn't starting. Another PTZ Pad bridge is probably running.` : `Bridge failed to start: ${e.message}`);
      resolve(null);
    });
    server.listen(port, host, () => {
      if (!quiet) {
        console.log(`PTZ Pad bridge running. Open http://localhost:${port} in Chrome or Edge.`);
        if (ORIGINS.size) console.log(`Also accepting commands from: ${[...ORIGINS].join(', ')}`);
      }
      resolve(server);
    });
  });
}

module.exports = { start, originAllowed };
