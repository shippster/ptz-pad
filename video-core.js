/*
 * RTSP / SRT video for auto-tracking.
 *
 * Runs FFmpeg (bundled through the ffmpeg-static package, or one found on
 * PATH) to decode a network stream into small RGBA frames. Gives the same
 * handle shape as ndi-core's videoStart, so the tracker treats both alike.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let ffmpegPath = null;
function findFfmpeg() {
  if (ffmpegPath) return ffmpegPath;
  try {
    let p = require('ffmpeg-static');
    if (p) {
      p = p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
      if (fs.existsSync(p)) return (ffmpegPath = p);
    }
  } catch (e) { /* not installed: fall back to PATH */ }
  return (ffmpegPath = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
}

const ALLOWED = /^(rtsps?|srt|rtmps?|udp|https?):\/\//i;
const hidePass = (s) => String(s).replace(/(\/\/[^:/@\s]+:)[^@\s]+@/g, '$1••••@');
const NO_FFMPEG = 'FFmpeg isn’t installed. Run the Start PTZ Pad launcher again with internet on.';

function inputArgs(url, { transport = 'tcp' } = {}) {
  const a = ['-hide_banner', '-nostdin', '-loglevel', 'info',
    '-fflags', 'nobuffer+discardcorrupt', '-flags', 'low_delay',
    '-probesize', '1000000', '-analyzeduration', '2000000'];
  if (/^rtsps?:/i.test(url)) a.push('-rtsp_transport', transport === 'udp' ? 'udp' : 'tcp', '-timeout', '6000000');
  else if (/^https?:/i.test(url)) a.push('-rw_timeout', '6000000');
  a.push('-i', url, '-an', '-sn', '-dn');
  return a;
}

// Turns FFmpeg's chatter into one useful sentence.
function explain(tail, url) {
  const t = tail.join('\n');
  if (/401|Unauthorized/i.test(t)) return 'The camera asked for a login. Put the username and password in the address, like rtsp://user:password@192.168.1.50/1';
  if (/404|Not Found/i.test(t)) return 'The camera doesn’t have a stream at that address. Check the path after the IP.';
  if (/Connection refused/i.test(t)) return 'The camera refused the connection. Check the port, and that RTSP or SRT streaming is turned on in the camera.';
  if (/timed out|Connection timed out|Immediate exit requested/i.test(t)) return 'The camera didn’t answer. Check the IP address and that this computer can reach it.';
  if (/Protocol not found|Unknown protocol/i.test(t)) return `This copy of FFmpeg can’t open ${url.split(':')[0].toUpperCase()} streams.`;
  if (/Invalid data found/i.test(t)) return 'The stream answered, but PTZ Pad couldn’t understand its video.';
  const last = tail.filter((l) => !/^\s*(Stream|Input|Output|Metadata|Duration|Press|  )/.test(l)).pop();
  return last ? hidePass(last.trim()) : 'The stream stopped.';
}

/**
 * Starts decoding a stream. onFrame({w, h, data}) gets at most one frame each
 * time handle.want is true; frames in between are dropped so tracking never lags.
 */
function videoStart({ url, maxWidth = 480, fps = 10, transport } = {}, onFrame) {
  url = String(url || '').trim();
  if (!ALLOWED.test(url)) throw new Error('Enter a stream address starting with rtsp:// or srt://');
  const h = { want: true, frames: 0, lastFrameAt: 0, lastSentAt: 0, unsupported: null, error: '', stopped: false, proc: null, retry: null, restarts: 0 };

  const run = () => {
    if (h.stopped) return;
    let w = 0, ht = 0, frameLen = 0, buf = Buffer.alloc(0), pastOutput = false, errBuf = '';
    const tail = [];
    const args = [...inputArgs(url, { transport }),
      '-vf', `fps=${fps},scale='min(${maxWidth},iw)':-2`,
      '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'];
    let p;
    try { p = spawn(findFfmpeg(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { h.error = NO_FFMPEG; return; }
    h.proc = p;
    p.on('error', (e) => { h.error = e.code === 'ENOENT' ? NO_FFMPEG : e.message; });
    p.stderr.on('data', (d) => {
      errBuf += d.toString();
      let i;
      while ((i = errBuf.search(/[\r\n]/)) >= 0) {
        const line = errBuf.slice(0, i); errBuf = errBuf.slice(i + 1);
        if (!line.trim()) continue;
        tail.push(line); if (tail.length > 30) tail.shift();
        if (/^Output #0/.test(line)) pastOutput = true;
        const m = pastOutput && !w && /Video: rawvideo.*?(\d{2,5})x(\d{2,5})/.exec(line);
        if (m) { w = +m[1]; ht = +m[2]; frameLen = w * ht * 4; }
      }
    });
    p.stdout.on('data', (d) => {
      if (!frameLen) return;
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      while (buf.length >= frameLen) {
        const frame = buf.subarray(0, frameLen);
        buf = buf.subarray(frameLen);
        h.frames++; h.lastFrameAt = Date.now(); h.error = ''; h.restarts = 0;
        if (h.want) {
          h.want = false; h.lastSentAt = Date.now();
          onFrame({ w, h: ht, data: new Uint8Array(frame) }); // a copy: the buffer gets reused
        }
      }
      if (buf.length) buf = Buffer.from(buf); // don't hold on to the whole chunk
    });
    p.on('close', () => {
      h.proc = null;
      if (h.stopped) return;
      if (!h.error) h.error = explain(tail, url);
      // Reconnect with a growing pause (up to 10 s), so a camera reboot or network blip recovers on its own.
      h.restarts++;
      h.retry = setTimeout(run, Math.min(10000, 1000 * h.restarts));
    });
  };
  run();
  return h;
}

function videoStop(h) {
  if (!h) return;
  h.stopped = true;
  clearTimeout(h.retry);
  if (h.proc) { try { h.proc.kill(); } catch (e) {} }
}

/** Grabs one frame as a JPEG data URL, to check an address from the camera form. */
function snapshot({ url, transport } = {}) {
  return new Promise((resolve) => {
    url = String(url || '').trim();
    if (!ALLOWED.test(url)) return resolve({ ok: false, error: 'Enter a stream address starting with rtsp:// or srt://' });
    const tail = [], chunks = [];
    let info = '', p;
    try {
      p = spawn(findFfmpeg(), [...inputArgs(url, { transport }), '-frames:v', '1', '-vf', "scale='min(480,iw)':-2", '-q:v', '5', '-f', 'mjpeg', 'pipe:1'],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { return resolve({ ok: false, error: NO_FFMPEG }); }
    let done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(kill); resolve(r); } };
    const kill = setTimeout(() => { try { p.kill(); } catch (e) {} }, 12000);
    p.on('error', (e) => finish({ ok: false, error: e.code === 'ENOENT' ? NO_FFMPEG : e.message }));
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', (d) => {
      for (const line of d.toString().split(/[\r\n]+/)) {
        if (!line.trim()) continue;
        tail.push(line); if (tail.length > 30) tail.shift();
        const m = !info && /Stream #\d+:\d+.*Video: (\w+).*?(\d{2,5})x(\d{2,5})/.exec(line);
        if (m) info = `${m[2]}×${m[3]} ${m[1].toUpperCase()}`;
      }
    });
    p.on('close', () => {
      const jpg = Buffer.concat(chunks);
      if (jpg.length > 500) finish({ ok: true, info, image: 'data:image/jpeg;base64,' + jpg.toString('base64') });
      else finish({ ok: false, error: explain(tail, url) });
    });
  });
}

module.exports = { videoStart, videoStop, snapshot, hidePass };
