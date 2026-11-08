// Runs in PTZ Pad's hidden tracker window: finds people in each frame with
// MediaPipe Pose (on-device) and reports who to follow.
import { FilesetResolver, PoseLandmarker } from '../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
import { summarize, pick, frameShift } from './logic.js';

const api = window.ptzTracker;
const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: false });
const thumb = document.createElement('canvas');
const tctx = thumb.getContext('2d');
const cams = new Map(); // id -> { pose, ts, state, lastPreview }
let vision = null;

async function makePose() {
  let last;
  for (const delegate of ['GPU', 'CPU']) {
    try {
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: new URL('../models/pose_landmarker_lite.task', location.href).href, delegate },
        runningMode: 'VIDEO',
        numPoses: 6, // room for a crowded stage, so the locked person isn't crowded out
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
    } catch (e) { last = e; }
  }
  throw last;
}

function preview(w, h) {
  const tw = 320, th = Math.round((h / w) * tw);
  thumb.width = tw; thumb.height = th;
  tctx.drawImage(work, 0, 0, tw, th);
  return thumb.toDataURL('image/jpeg', 0.6);
}

api.onFrame(async ({ id, w, h, data }) => {
  try {
    let cam = cams.get(id);
    if (!cam) { cam = { pose: null, ts: 0, state: {}, lastPreview: 0 }; cams.set(id, cam); }
    if (!cam.pose) cam.pose = await makePose();
    if (work.width !== w || work.height !== h) { work.width = w; work.height = h; }
    wctx.putImageData(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), w, h), 0, 0);
    cam.ts = Math.max(cam.ts + 1, performance.now());
    const now0 = performance.now();
    const res = cam.pose.detectForVideo(work, cam.ts);
    const world = res.worldLandmarks || [];
    const people = (res.landmarks || []).map((lm, i) => summarize(lm, w / h, world[i])).filter(Boolean);
    const t = pick(cam.state, people, now0);
    const out = {
      id, found: !!t, w, h,
      x: t ? t.x : null, headY: t ? t.headY : null, scale: t ? t.scale : null, box: t ? t.box : null,
      people: people.map((p) => p.box),
      lost: !t && !!cam.state.target, // still waiting for the same person to come back
      misses: cam.state.misses || 0,
      locked: !!cam.state.held, lockPending: !!cam.state.holdReq,
      crossing: !!cam.state.crossing, // holding still while someone crosses in front of them
      learned: cam.state.model ? cam.state.model.n : 0, // how many clear looks at their build so far
      waitBox: !t && cam.state.target ? cam.state.target.box : null, // where they were last seen
      shift: frameShift(cam.state, data, w, h), // how the whole picture moved: used to check pan direction
    };
    const now = performance.now();
    if (now - cam.lastPreview > 250) { cam.lastPreview = now; out.preview = preview(w, h); }
    api.result(out);
  } catch (e) {
    api.result({ id, found: false, error: `Tracking problem: ${(e && e.message) || e}` });
  }
});
// Picks and locks from the dashboard: {x, y} picks a person; hold true/false locks on the
// person being followed (or the next one) or unlocks; cfg carries the dashboard's settings.
api.onLock(({ id, x, y, hold, cfg }) => {
  let cam = cams.get(id);
  if (!cam) { cam = { pose: null, ts: 0, state: {}, lastPreview: 0 }; cams.set(id, cam); }
  const st = cam.state;
  if (cfg) st.cfg = cfg;
  if (x != null && y != null) st.lock = { x, y };
  if (hold === true) { if (st.target && x == null) { st.held = true; st.holdReq = false; } else st.holdReq = true; }
  if (hold === false) { st.held = false; st.holdReq = false; }
});
api.onStop(({ id }) => { const cam = cams.get(id); if (cam && cam.pose) cam.pose.close(); cams.delete(id); });

(async () => {
  try {
    vision = await FilesetResolver.forVisionTasks(new URL('../node_modules/@mediapipe/tasks-vision/wasm', location.href).href);
    api.ready({ ok: true });
  } catch (e) {
    api.ready({ error: `The tracking engine didn't start: ${(e && e.message) || e}` });
  }
})();
