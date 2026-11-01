/*
 * PTZ Pad bridge core: VISCA over UDP/TCP and HTTP with Basic/Digest login.
 * Used by the desktop app (main.js) and by the optional standalone server (ptz-bridge.js).
 */
const dgram = require('dgram');
const net = require('net');
const crypto = require('crypto');

let udp = null;
function getUdp() {
  if (!udp) {
    udp = dgram.createSocket('udp4');
    udp.on('error', (e) => console.error('[udp]', e.message));
    udp.on('message', () => {}); // acks and completions are ignored
    udp.bind();
  }
  return udp;
}
const seq = new Map(); // host:port -> sequence number (Sony VISCA over IP)
const tcp = new Map(); // host:port -> socket

const udpSend = (buf, port, host) =>
  new Promise((res, rej) => getUdp().send(buf, port, host, (e) => (e ? rej(e) : res())));

async function sendSony(host, port, payload) {
  const key = `${host}:${port}`;
  if (!seq.has(key)) {
    seq.set(key, 0);
    await udpSend(Buffer.from([0x02, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0x01]), port, host); // reset sequence
  }
  let s = seq.get(key) + 1;
  if (s > 0xffffffff) s = 1;
  seq.set(key, s);
  const head = Buffer.alloc(8);
  head.writeUInt16BE(0x0100, 0);
  head.writeUInt16BE(payload.length, 2);
  head.writeUInt32BE(s, 4);
  await udpSend(Buffer.concat([head, payload]), port, host);
}

function sendTcp(host, port, payload) {
  const key = `${host}:${port}`;
  return new Promise((res, rej) => {
    let s = tcp.get(key);
    if (!s || s.destroyed) {
      s = net.createConnection({ host, port });
      s.setNoDelay(true);
      s.setTimeout(4000, () => s.destroy(new Error('TCP connect timed out')));
      s.on('connect', () => s.setTimeout(0));
      s.on('data', () => {});
      s.on('error', (e) => { console.error('[tcp]', key, e.message); tcp.delete(key); });
      s.on('close', () => tcp.delete(key));
      tcp.set(key, s);
    }
    s.write(payload, (e) => (e ? rej(e) : res()));
  });
}

/* ---------- HTTP with Basic / Digest ---------- */
const authCache = new Map();

function parseChallenge(header) {
  if (!header) return null;
  const i = header.search(/digest/i);
  if (i >= 0) {
    const ch = { scheme: 'digest', nc: 0 };
    for (const m of header.slice(i + 6).matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) ch[m[1].toLowerCase()] = m[2] ?? m[3];
    return ch;
  }
  return /basic/i.test(header) ? { scheme: 'basic' } : null;
}

function authHeader(ch, uri, user, pass) {
  if (ch.scheme === 'basic') return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
  ch.nc += 1;
  const nc = ch.nc.toString(16).padStart(8, '0');
  const cnonce = crypto.randomBytes(8).toString('hex');
  let ha1 = md5(`${user}:${ch.realm}:${pass}`);
  if (/md5-sess/i.test(ch.algorithm || '')) ha1 = md5(`${ha1}:${ch.nonce}:${cnonce}`);
  const ha2 = md5(`GET:${uri}`);
  const qops = (ch.qop || '').split(',').map((s) => s.trim()).filter(Boolean);
  const qop = qops.includes('auth') ? 'auth' : qops[0];
  const response = qop ? md5(`${ha1}:${ch.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${ch.nonce}:${ha2}`);
  let h = `Digest username="${user}", realm="${ch.realm}", nonce="${ch.nonce}", uri="${uri}", response="${response}"`;
  if (ch.opaque) h += `, opaque="${ch.opaque}"`;
  if (ch.algorithm) h += `, algorithm=${ch.algorithm}`;
  if (qop) h += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  return h;
}

/* ---------- public API: always resolves to {ok, ...} ---------- */
function describe(e) {
  if (e && e.name === 'TimeoutError') return 'camera did not answer within 4 s';
  const code = e && e.cause && (e.cause.code || (e.cause.errors && e.cause.errors[0] && e.cause.errors[0].code));
  const why = { ECONNREFUSED: 'camera refused the connection (wrong port?)', EHOSTUNREACH: 'camera unreachable', ENETUNREACH: 'network unreachable', ETIMEDOUT: 'camera did not answer', ENOTFOUND: 'camera name not found' }[code];
  if (why) return why;
  if (code) return `${code} (camera unreachable?)`;
  if (e && e.cause && e.cause.message) return `camera unreachable (${e.cause.message})`;
  return (e && e.message) || String(e);
}

async function visca({ host, port, mode = 'sony', hex } = {}) {
  try {
    host = String(host || '').trim();
    port = Number(port);
    hex = String(hex || '').replace(/[^0-9a-f]/gi, '');
    if (!host || !(port > 0 && port < 65536) || !hex || hex.length % 2 || hex.length > 64) {
      return { ok: false, error: 'host, port and a VISCA hex command are required' };
    }
    const payload = Buffer.from(hex, 'hex');
    if (mode === 'tcp') await sendTcp(host, port, payload);
    else if (mode === 'raw') await udpSend(payload, port, host);
    else await sendSony(host, port, payload);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describe(e) };
  }
}

async function http({ url, user = '', pass = '', maxBody = 300 } = {}) {
  try {
    if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, error: 'url must start with http:// or https://' };
    const u = new URL(url);
    const uri = u.pathname + u.search;
    const go = (ch) => fetch(url, {
      headers: user && ch ? { Authorization: authHeader(ch, uri, user, pass) } : {},
      signal: AbortSignal.timeout(4000),
    });
    let r = await go(authCache.get(u.origin));
    if (r.status === 401 && user) {
      await r.arrayBuffer().catch(() => {});
      const ch = parseChallenge(r.headers.get('www-authenticate'));
      if (ch) { authCache.set(u.origin, ch); r = await go(ch); }
    }
    const body = (await r.text().catch(() => '')).slice(0, Math.min(200000, Math.max(300, Number(maxBody) || 300)));
    const ok = r.status >= 200 && r.status < 300;
    return {
      ok, status: r.status, body,
      error: ok ? undefined : `camera replied ${r.status}${r.status === 401 ? ' (check username and password)' : ''}`,
    };
  } catch (e) {
    return { ok: false, error: describe(e) };
  }
}

function close() {
  for (const s of tcp.values()) s.destroy();
  tcp.clear();
  if (udp) { try { udp.close(); } catch (e) {} udp = null; }
}

module.exports = { visca, http, close };
