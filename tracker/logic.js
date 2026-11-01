// Pure tracking helpers: turn pose landmarks into people, and keep following one of them.
// MediaPipe pose landmark indices
const NOSE = 0, L_EYE = 2, R_EYE = 5, L_SH = 11, R_SH = 12, L_HIP = 23, R_HIP = 24;
const seen = (p) => !!p && (p.visibility == null || p.visibility > 0.5);

/**
 * One pose (33 normalized landmarks) -> a person summary, or null.
 * x: horizontal center of the upper body; headY: nose height;
 * scale: body size in frame-width units (shoulder width, or head-to-shoulder
 * drop when they turn side-on), used to hold a steady shot size.
 */
export function summarize(lm, aspect = 16 / 9) {
  if (!lm || lm.length < 25) return null;
  const pts = lm.filter(seen);
  if (pts.length < 4) return null;
  const nose = lm[NOSE], ls = lm[L_SH], rs = lm[R_SH];
  const shoulders = seen(ls) && seen(rs);
  let x, headY, scale = 0;
  if (shoulders) { x = (ls.x + rs.x) / 2; scale = Math.abs(ls.x - rs.x); }
  else if (seen(nose)) x = nose.x;
  else return null;
  if (seen(nose)) headY = nose.y;
  else if (seen(lm[L_EYE]) || seen(lm[R_EYE])) headY = (seen(lm[L_EYE]) ? lm[L_EYE] : lm[R_EYE]).y;
  else if (shoulders) headY = (ls.y + rs.y) / 2 - 0.08;
  else return null;
  if (shoulders && seen(nose)) {
    const drop = Math.abs((ls.y + rs.y) / 2 - nose.y) / aspect; // vertical distance in width units
    scale = Math.max(scale, drop * 2.2);
  }
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  y0 = Math.max(0, y0 - (y1 - y0) * 0.08); // landmarks stop at the face: pad for the top of the head
  return { x, headY, scale, box: [Math.max(0, x0), y0, Math.min(1, x1), Math.min(1, y1)] };
}

const dist = (a, b) => Math.hypot(a.x - b.x, (a.headY - b.headY) * 0.6);
const inBox = (pt, b) => pt.x >= b[0] - 0.02 && pt.x <= b[2] + 0.02 && pt.y >= b[1] - 0.02 && pt.y <= b[3] + 0.02;

/* ---------- who is who ----------
 * A colour signature of each person's shirt (upper body), so the tracker can
 * tell the speaker from someone who walks close by. The signature is a 64-bin
 * colour histogram plus the shirt's main colour, for showing on screen. */
const BINS = 4; // per channel: 64 colour bins
// The part of a person's box the shirt colour is read from: the middle of the upper body.
export function shirtBox(box) {
  const w = box[2] - box[0], h = box[3] - box[1];
  return [box[0] + w * 0.2, box[1] + h * 0.18, box[2] - w * 0.2, box[1] + h * 0.6];
}
export function signature(data, w, h, box) {
  const [x0, y0, x1, y1] = shirtBox(box);
  const px0 = Math.max(0, Math.floor(x0 * w)), px1 = Math.min(w - 1, Math.ceil(x1 * w));
  const py0 = Math.max(0, Math.floor(y0 * h)), py1 = Math.min(h - 1, Math.ceil(y1 * h));
  if (px1 - px0 < 4 || py1 - py0 < 4) return null;
  const n3 = BINS * BINS * BINS;
  const hist = new Float32Array(n3), sr = new Float32Array(n3), sg = new Float32Array(n3), sb = new Float32Array(n3);
  const sx = Math.max(1, Math.floor((px1 - px0) / 24)), sy = Math.max(1, Math.floor((py1 - py0) / 24));
  let n = 0;
  for (let y = py0; y <= py1; y += sy) {
    for (let x = px0; x <= px1; x += sx) {
      const o = (y * w + x) * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      const i = ((r * BINS) >> 8) * BINS * BINS + ((g * BINS) >> 8) * BINS + ((b * BINS) >> 8);
      hist[i]++; sr[i] += r; sg[i] += g; sb[i] += b; n++;
    }
  }
  if (!n) return null;
  let top = 0;
  for (let i = 1; i < n3; i++) if (hist[i] > hist[top]) top = i;
  const rgb = [Math.round(sr[top] / hist[top]), Math.round(sg[top] / hist[top]), Math.round(sb[top] / hist[top])];
  for (let i = 0; i < n3; i++) hist[i] /= n;
  return { h: hist, rgb };
}
// 1: same colours, 0: nothing in common (Bhattacharyya coefficient).
export function likeness(a, b) {
  if (!a || !b) return 0.5;
  let s = 0;
  for (let i = 0; i < a.h.length; i++) s += Math.sqrt(a.h[i] * b.h[i]);
  return s;
}
const blend = (a, b, k) => {
  if (!a) return b; if (!b) return a;
  const h = new Float32Array(a.h.length);
  for (let i = 0; i < h.length; i++) h[i] = a.h[i] * (1 - k) + b.h[i] * k;
  return { h, rgb: a.rgb.map((v, i) => Math.round(v * (1 - k) + b.rgb[i] * k)) };
};
const copySig = (s) => (s ? { h: Float32Array.from(s.h), rgb: s.rgb.slice() } : null);

function follow(state, p, now, learn) {
  const t = state.target;
  const vx = t && t.at && now > t.at ? (p.x - t.x) / ((now - t.at) / 1000) : 0;
  state.target = {
    x: p.x, headY: p.headY, scale: p.scale, at: now,
    vx: t ? (t.vx || 0) * 0.7 + Math.max(-1, Math.min(1, vx)) * 0.3 : 0,
    sig: learn ? blend(t && t.sig, p.sig, t && t.sig ? 0.08 : 1) : (t && t.sig) || p.sig,
  };
  state.misses = 0;
  return p;
}

/**
 * Chooses who to follow. state is kept per camera between frames:
 *   target   the person being followed
 *   misses   detections in a row without them
 *   held     a shirt colour locked with the controller; while set, PTZ Pad never
 *            follows anyone whose shirt doesn't match, and never gives up on it
 *   lock     {x, y}: a click or pop-up pick
 *   holdReq  lock the colour of whoever is followed next
 *   cfg      { missFrames, holdMatch } from the dashboard
 * Without a colour lock, the red box stays on the speaker until they have been
 * missing for missFrames detections in a row; only then is someone else chosen.
 */
export function pick(state, people, now = performance.now()) {
  const cfg = state.cfg || {};
  const missMax = Math.max(1, cfg.missFrames || 10);
  const holdMin = cfg.holdMatch || 0.6;
  const done = (p) => {
    if (p && state.holdReq) { state.held = copySig(state.target.sig || p.sig); state.holdReq = false; }
    return p;
  };
  if (state.lock) { // picked by hand: follow them (and re-lock on their shirt if locked)
    const pt = state.lock;
    state.lock = null;
    const hit = people.find((p) => inBox(pt, p.box))
      || people.slice().sort((a, b) => dist(a, { x: pt.x, headY: pt.y }) - dist(b, { x: pt.x, headY: pt.y }))[0];
    if (hit) {
      if (state.held) state.holdReq = true;
      state.target = null;
      return done(follow(state, hit, now, true));
    }
  }
  const t = state.target;
  if (t) {
    const held = state.held;
    const gap = Math.min(1, (now - t.at) / 1000); // seconds since last seen
    const pred = { x: t.x + (t.vx || 0) * gap, headY: t.headY };
    const misses = state.misses || 0;
    const reach = 0.1 + Math.min(0.35, misses * 0.02); // look wider the longer they're gone
    let best = null, bc = Infinity, second = Infinity;
    for (const p of people) {
      const d = dist(p, pred);
      const like = likeness(held || t.sig, p.sig);
      const size = t.scale > 0.005 && p.scale > 0.005 ? Math.abs(Math.log(p.scale / t.scale)) : 0;
      // Locked: only the locked shirt colour, anywhere in the shot once they've been missed.
      // Not locked: near where they should be and similar, or far away only if clearly the same.
      const ok = held ? like >= holdMin && (d < reach || misses > 0)
        : (d < reach && like > 0.45) || (misses > 0 && like > 0.8 && size < 0.6);
      if (!ok) continue;
      const cost = d / reach + (1 - like) * (held ? 4 : 2.5) + size * 0.8;
      if (cost < bc) { second = bc; bc = cost; best = p; } else if (cost < second) second = cost;
    }
    if (best) {
      // A locked colour never changes. Otherwise, colours are only learned from a clear frame
      // (two people about as likely, like when they cross, teaches nothing).
      return done(follow(state, best, now, !held && second - bc > 0.4));
    }
    state.misses = misses + 1;
    // Only choose someone else after missFrames detections in a row without the speaker,
    // and never while a colour is locked.
    if (!held && state.misses >= missMax) state.target = null;
    return null;
  }
  // Nobody followed yet: take the person nearest the center of the shot (locked: the best colour match).
  if (state.held) {
    const best = people.map((p) => [p, likeness(state.held, p.sig)]).filter((x) => x[1] >= holdMin).sort((a, b) => b[1] - a[1])[0];
    return best ? done(follow(state, best[0], now, false)) : null;
  }
  // Size only breaks a near-tie (two people about equally central: the nearer one).
  const score = (p) => -Math.hypot(p.x - 0.5, (p.headY - 0.4) * 0.5) + p.scale * 0.05;
  const best = people.slice().sort((a, b) => score(b) - score(a))[0];
  return best ? done(follow(state, best, now, true)) : null;
}

/* ---------- camera motion ----------
 * How far the whole picture slid since the last frame, measured from the
 * column and row brightness profiles. It reflects the background (the
 * camera turning), not the person, so PTZ Pad can check that its pan and
 * tilt commands really move the picture the way it expects. */
function profiles(data, w, h) {
  const cols = new Float32Array(w), rows = new Float32Array(h);
  const step = 2; // every other pixel is plenty
  for (let y = 0; y < h; y += step) {
    let o = y * w * 4;
    for (let x = 0; x < w; x += step, o += 4 * step) {
      const g = data[o] * 0.3 + data[o + 1] * 0.59 + data[o + 2] * 0.11;
      cols[x] += g; rows[y] += g;
    }
  }
  return { cols: highPass(fill(cols, step)), rows: highPass(fill(rows, step)) };
}
function fill(a, step) { for (let i = 0; i < a.length; i++) if (i % step) a[i] = a[i - (i % step)]; return a; }
function highPass(a) {
  // Remove slow brightness changes so only edges and textures are compared.
  const n = a.length, r = Math.max(4, Math.round(n / 40)), out = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < Math.min(n, r); i++) sum += a[i];
  for (let i = 0; i < n; i++) {
    const lo = i - r - 1, hi = i + r;
    if (hi < n) sum += a[hi];
    if (lo >= 0) sum -= a[lo];
    const cnt = Math.min(n - 1, hi) - Math.max(0, lo + 1) + 1;
    out[i] = a[i] - sum / cnt;
  }
  let s = 0; for (let i = 0; i < n; i++) s += Math.abs(out[i]);
  const m = s / n || 1;
  for (let i = 0; i < n; i++) out[i] /= m;
  return out;
}
function bestShift(prev, cur, maxShift) {
  // Content moved by s pixels when cur[i + s] matches prev[i].
  const n = prev.length, costs = [];
  let best = 0, bestCost = Infinity;
  for (let s = -maxShift; s <= maxShift; s++) {
    let c = 0, k = 0;
    for (let i = Math.max(0, -s); i < Math.min(n, n - s); i++) { c += Math.abs(prev[i] - cur[i + s]); k++; }
    c /= k;
    costs.push(c);
    if (c < bestCost) { bestCost = c; best = s; }
  }
  const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
  return { shift: best / n, ok: avg > 0 && bestCost < avg * 0.7 }; // a clear winner, not a flat match
}

/** Returns {dx, dy, ok}: picture movement since the previous frame, as fractions of the frame (right and down are positive). */
export function frameShift(state, data, w, h) {
  const p = profiles(data, w, h);
  const prev = state.prof;
  state.prof = p;
  if (!prev || prev.cols.length !== w || prev.rows.length !== h) return { dx: 0, dy: 0, ok: false };
  const sx = bestShift(prev.cols, p.cols, Math.round(w * 0.15));
  const sy = bestShift(prev.rows, p.rows, Math.round(h * 0.15));
  return { dx: sx.shift, dy: sy.shift, ok: sx.ok && sy.ok };
}
