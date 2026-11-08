// Pure tracking helpers: turn pose landmarks into people, and keep following one of them.
// MediaPipe pose landmark indices
const NOSE = 0, L_EYE = 2, R_EYE = 5, L_EAR = 7, R_EAR = 8, L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16,
  L_HIP = 23, R_HIP = 24, L_KN = 25, R_KN = 26, L_AN = 27, R_AN = 28;
const seen = (p) => !!p && (p.visibility == null || p.visibility > 0.5);
const sure = (p) => !!p && (p.visibility == null || p.visibility > 0.7);

/**
 * One pose (33 normalized landmarks) -> a person summary, or null.
 * x: horizontal center of the upper body; headY: nose height;
 * scale: body size in frame-width units (shoulder width, or head-to-shoulder
 * drop when they turn side-on), used to hold a steady shot size.
 * build: the person's body proportions from the 3D (world) landmarks, when given.
 */
export function summarize(lm, aspect = 16 / 9, world = null) {
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
  return { x, headY, scale, box: [Math.max(0, x0), y0, Math.min(1, x1), Math.min(1, y1)], build: buildOf(lm, world) };
}

const dist = (a, b) => Math.hypot(a.x - b.x, (a.headY - b.headY) * 0.6);
const inBox = (pt, b) => pt.x >= b[0] - 0.02 && pt.x <= b[2] + 0.02 && pt.y >= b[1] - 0.02 && pt.y <= b[3] + 0.02;
export function overlap(a, b) { // intersection over union of two boxes
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const i = w * h, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i;
  return u > 0 ? i / u : 0;
}

/* ---------- who is who ----------
 * A person is told apart by two things, neither of them colour:
 *   1. where they are: the same body moving smoothly from frame to frame, with its own speed;
 *   2. their build: body proportions measured in 3D by the pose model (shoulder width,
 *      head size, neck, arms, torso, hips and legs), each compared with their shoulder
 *      width so it doesn't matter how far away they stand or which way they face.
 * Clothes, lighting and the colour of the set make no difference to either. */
const PARTS = {
  head: [[L_EAR, R_EAR]],
  neck: 'neck',
  upperArm: [[L_SH, L_EL], [R_SH, R_EL]],
  forearm: [[L_EL, L_WR], [R_EL, R_WR]],
  torso: [[L_SH, L_HIP], [R_SH, R_HIP]],
  hips: [[L_HIP, R_HIP]],
  thigh: [[L_HIP, L_KN], [R_HIP, R_KN]],
  shin: [[L_KN, L_AN], [R_KN, R_AN]],
};
const len3 = (w, a, b) => Math.hypot(w[a].x - w[b].x, w[a].y - w[b].y, w[a].z - w[b].z);
/** Body proportions from the world landmarks: { part: log(length / shoulder width) }, or null. */
export function buildOf(lm, world) {
  if (!world || world.length < 29 || !sure(lm[L_SH]) || !sure(lm[R_SH])) return null;
  const sw = len3(world, L_SH, R_SH);
  if (!(sw > 0.05)) return null;
  const out = { size: Math.log(sw) };
  for (const [name, pairs] of Object.entries(PARTS)) {
    let v;
    if (pairs === 'neck') {
      if (!sure(lm[NOSE])) continue;
      const mid = { x: (world[L_SH].x + world[R_SH].x) / 2, y: (world[L_SH].y + world[R_SH].y) / 2, z: (world[L_SH].z + world[R_SH].z) / 2 };
      v = Math.hypot(world[NOSE].x - mid.x, world[NOSE].y - mid.y, world[NOSE].z - mid.z);
    } else {
      const ls = pairs.filter(([a, b]) => sure(lm[a]) && sure(lm[b])).map(([a, b]) => len3(world, a, b));
      if (!ls.length) continue;
      v = ls.reduce((s, x) => s + x, 0) / ls.length;
    }
    if (v > 0.01) out[name] = Math.log(v / sw);
  }
  return Object.keys(out).length >= 3 ? out : null; // size plus at least two proportions
}
/** Adds one measurement to a person's build (running average, then a slow blend). */
export function learnBuild(model, build) {
  if (!build) return model;
  const m = model ? { n: model.n + 1, f: { ...model.f } } : { n: 1, f: {} };
  for (const [k, x] of Object.entries(build)) {
    const o = m.f[k];
    if (!o) { m.f[k] = { m: x, v: 0, n: 1 }; continue; }
    const a = o.n < 20 ? 1 / (o.n + 1) : 0.05, d = x - o.m;
    m.f[k] = { m: o.m + a * d, v: (1 - a) * (o.v + a * d * d), n: o.n + 1 };
  }
  return m;
}
/** How well a measurement fits a learned build: { score 0..1, parts }, or null when there's too little to compare. */
export function buildMatch(model, build) {
  if (!model || !build) return null;
  let s = 0, k = 0;
  for (const [name, x] of Object.entries(build)) {
    const o = model.f[name];
    if (!o || o.n < 5) continue;
    const tol = name === 'size' ? 0.18 : Math.max(0.07, Math.sqrt(o.v) * 1.5); // about 7% for proportions
    const z = (x - o.m) / tol;
    s += Math.min(9, z * z); k++;
  }
  return k >= 3 ? { score: Math.exp(-0.5 * (s / k)), parts: k } : null;
}

function follow(state, p, now, learn) {
  const t = state.target;
  const vx = t && t.at && now > t.at ? (p.x - t.x) / ((now - t.at) / 1000) : 0;
  state.target = {
    x: p.x, headY: p.headY, scale: p.scale, box: p.box, at: now,
    vx: t ? (t.vx || 0) * 0.7 + Math.max(-1, Math.min(1, vx)) * 0.3 : 0,
  };
  if (learn) state.model = learnBuild(state.model, p.build);
  state.misses = 0;
  state.amb = 0;
  return p;
}
const AMB_MAX = 8; // detections to hold still while people cross, before deciding anyway

/* Everyone else in the shot is followed too, each with their own position and speed, so a
 * person walking in front of the speaker keeps being that person: while the speaker is hidden
 * behind them, their detection is claimed by their own track instead of taking over the red box.
 * Anyone seen in the same frame as the speaker ("together") is certainly someone else, so they
 * can never become the speaker, however alike they look. People who only appear while the
 * speaker is out of sight might be the speaker coming back, so they're judged on their own. */
function predict(o, now) {
  const gap = Math.min(1, (now - o.at) / 1000);
  return { x: o.x + (o.vx || 0) * gap, headY: o.headY };
}
function moveTrack(o, p, now) {
  const vx = o.at && now > o.at ? (p.x - o.x) / ((now - o.at) / 1000) : 0;
  o.vx = (o.vx || 0) * 0.7 + Math.max(-1, Math.min(1, vx)) * 0.3;
  o.x = p.x; o.headY = p.headY; o.scale = p.scale; o.box = p.box; o.at = now; o.misses = 0; o.seen = (o.seen || 0) + 1;
}
const sizeGap = (a, b) => (a.scale > 0.005 && b.scale > 0.005 ? Math.abs(Math.log(b.scale / a.scale)) : 0);
// How well a detection continues a track (lower is better), or Infinity when it can't be them.
function trackCost(o, p, now) {
  const d = dist(p, predict(o, now));
  return d < 0.15 ? d / 0.1 + sizeGap(o, p) * 0.8 : Infinity;
}
function updateOthers(state, people, chosen, now) {
  const others = state.others || [];
  const free = people.filter((p) => p !== chosen);
  const pairs = [];
  for (const o of others) for (const p of free) { const c = trackCost(o, p, now); if (c < Infinity) pairs.push([c, o, p]); }
  pairs.sort((a, b) => a[0] - b[0]);
  const usedO = new Set(), usedP = new Set();
  for (const [, o, p] of pairs) {
    if (usedO.has(o) || usedP.has(p)) continue;
    usedO.add(o); usedP.add(p); moveTrack(o, p, now);
  }
  for (const o of others) if (!usedO.has(o)) o.misses = (o.misses || 0) + 1;
  for (const p of free) {
    if (usedP.has(p) || (chosen && overlap(p.box, chosen.box) > 0.5)) continue; // a double of the speaker
    const o = { at: now }; moveTrack(o, p, now); o.vx = 0; others.push(o); usedO.add(o);
  }
  if (chosen) for (const o of usedO) o.together = true; // seen alongside the speaker
  state.others = others.filter((o) => o.misses <= 20);
}

/**
 * Chooses who to follow. state is kept per camera between frames:
 *   target   the person being followed (where they are and how fast they move)
 *   model    their build, learned while they're clearly on their own
 *   others   everyone else in the shot, each followed the same way
 *   misses   detections in a row without them
 *   held     locked on this one person: PTZ Pad never follows anyone else and
 *            never gives up on them, until the operator unlocks or picks someone
 *   lock     {x, y}: a click or pop-up pick (the operator choosing a person)
 *   holdReq  lock on whoever is followed next
 *   amb      detections held still while two people cross
 *   cfg      { missFrames, holdMatch } from the dashboard
 * Without a lock, the red box stays on the speaker until they have been missing
 * for missFrames detections in a row; only then is someone else chosen.
 */
export function pick(state, people, now = performance.now()) {
  const cfg = state.cfg || {};
  const missMax = Math.max(1, cfg.missFrames || 10);
  const holdMin = cfg.holdMatch || 0.6;
  state.crossing = false;
  const done = (p) => {
    if (p && state.holdReq && state.target) { state.held = true; state.holdReq = false; }
    updateOthers(state, people, p, now);
    return p;
  };
  if (state.lock) { // picked by hand: a new person. Their build is learned from scratch.
    const pt = state.lock;
    state.lock = null;
    const hit = people.find((p) => inBox(pt, p.box))
      || people.slice().sort((a, b) => dist(a, { x: pt.x, headY: pt.y }) - dist(b, { x: pt.x, headY: pt.y }))[0];
    if (hit) {
      if (state.held) state.holdReq = true;
      // The person who was followed becomes one of the others.
      if (state.target) (state.others = state.others || []).push({ ...state.target, misses: 0, together: true });
      state.others = (state.others || []).filter((o) => !(o.box && overlap(o.box, hit.box) > 0.5));
      state.held = false; state.target = null; state.model = null;
      return done(follow(state, hit, now, true));
    }
  }
  const t = state.target;
  if (t) {
    const held = !!state.held;
    const pred = predict(t, now);
    const shift = pred.x - t.x;
    const predBox = t.box ? [t.box[0] + shift, t.box[1], t.box[2] + shift, t.box[3]] : null;
    const misses = state.misses || 0;
    const reach = 0.1 + Math.min(0.35, misses * 0.02); // look wider the longer they're gone
    // Locked: they're only picked back up close to where they were lost (the search area grows
    // slowly), or anywhere once they've been gone a while and their build clearly matches.
    const heldReach = 0.1 + Math.min(0.2, misses * 0.01);
    const learned = state.model && state.model.n >= 20;
    const others = (state.others || []).filter((o) => o.together);
    const near = people.filter((p) => dist(p, pred) < reach || (predBox && overlap(p.box, predBox) > 0.05));
    const crowded = near.length > 1 || others.some((o) => o.misses === 0 && dist(o, pred) < 0.15);
    let best = null, bc = Infinity, second = Infinity;
    for (const p of people) {
      const d = dist(p, pred);
      const m = buildMatch(state.model, p.build);
      const like = m ? m.score : null;
      const size = sizeGap(t, p);
      const strong = learned && m && m.parts >= 4 && like >= Math.max(0.85, holdMin + 0.2);
      // Someone else's track fits this detection about as well: it's them, not the speaker.
      const mine = d / 0.1 + size * 0.8;
      const claimed = others.some((o) => trackCost(o, p, now) < mine + 0.3);
      let ok;
      if (misses <= 2) {
        // Still in sight: the same body moving smoothly. Build only rules out a clear mismatch
        // (someone half hidden measures badly).
        ok = !claimed && d < reach && size < 0.7 && (like == null || like >= (held ? holdMin * 0.5 : 0.25));
      } else if (held) {
        ok = !claimed && ((d < heldReach && (like == null || like >= holdMin)) || (misses >= missMax && strong));
      } else {
        ok = (!claimed && d < reach && (like == null || like > 0.4)) || (like != null && like > 0.8 && size < 0.6 && !claimed);
      }
      if (!ok) continue;
      const cost = d / reach + size * 0.8 + (like == null ? 0.3 : (1 - like) * (crowded ? 2.5 : 1.2));
      if (cost < bc) { second = bc; bc = cost; best = p; } else if (cost < second) second = cost;
    }
    if (best) {
      // Two people about as likely (they're crossing): hold still rather than guess, for a moment.
      if (crowded && second - bc < 0.35 && misses === 0 && (state.amb || 0) < AMB_MAX) {
        state.amb = (state.amb || 0) + 1;
        state.crossing = true;
        return null;
      }
      // Build is only learned from a clear frame, with nobody else close by.
      return done(follow(state, best, now, !crowded && second - bc > 0.4));
    }
    state.misses = misses + 1;
    const behind = others.some((o) => o.misses === 0 && dist(o, pred) < 0.2); // hidden behind someone
    if (behind) state.crossing = true;
    // Only choose someone else after missFrames detections in a row without the speaker (three
    // times as long while they're hidden behind someone), and never while locked.
    if (!held && state.misses >= missMax * (behind ? 3 : 1)) { state.target = null; state.model = null; }
    return done(null);
  }
  // Nobody followed yet: take the person nearest the center of the shot.
  // Size only breaks a near-tie (two people about equally central: the nearer one).
  const score = (p) => -Math.hypot(p.x - 0.5, (p.headY - 0.4) * 0.5) + p.scale * 0.05;
  const best = people.slice().sort((a, b) => score(b) - score(a))[0];
  if (!best) return done(null);
  state.model = null;
  state.others = [];
  return done(follow(state, best, now, true));
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
