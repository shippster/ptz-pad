// Simulated crossings, exits and picks for the auto-tracking person lock. Run: node tools/test-tracking.mjs
import { pick } from '../tracker/logic.js';
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return (s - 3) / Math.sqrt(0.5); };
const BASE = { size: Math.log(0.38), head: Math.log(0.42), neck: Math.log(0.55), upperArm: Math.log(0.78), forearm: Math.log(0.68), torso: Math.log(1.35), hips: Math.log(0.72), thigh: Math.log(1.15), shin: Math.log(1.1) };
const bodyA = { ...BASE };
const bodyB = Object.fromEntries(Object.entries(BASE).map(([k, v], i) => [k, v + (i % 2 ? 0.13 : -0.11)]));
const bodyC = Object.fromEntries(Object.entries(BASE).map(([k, v], i) => [k, v + (i % 3 ? -0.12 : 0.14)]));
const noisy = (b, parts) => Object.fromEntries(Object.entries(b).filter(([k]) => !parts || parts.includes(k)).map(([k, v]) => [k, v + gauss() * 0.04]));
const UPPER = ['size', 'head', 'neck', 'upperArm', 'forearm'];
const person = (name, x, scale, body, parts) => {
  const w = scale * 1.6, h = scale * 3.2, top = 0.25;
  return { name, x: x + gauss() * 0.003, headY: top + 0.05 + gauss() * 0.003, scale, box: [x - w / 2, top, x + w / 2, Math.min(1, top + h)], build: body ? noisy(body, parts) : null };
};
function run(title, frames, opts = {}) {
  const st = { cfg: { missFrames: 10, holdMatch: 0.6 } };
  let now = 1000; const log = []; let wrong = 0, firstWrong = null;
  for (let f = 0; f < frames.length; f++) {
    const fr = frames[f];
    if (fr.lock) st.lock = fr.lock;
    if (fr.hold) { if (st.target && !fr.lock) st.held = true; else st.holdReq = true; }
    const t = pick(st, fr.people, now);
    const who = t ? t.name : '-';
    log.push(who);
    if (t && fr.want && t.name !== fr.want) { wrong++; if (firstWrong == null) firstWrong = f; }
    now += 66;
  }
  const runs = []; for (const w of log) { if (!runs.length || runs.at(-1)[0] !== w) runs.push([w, 0]); runs.at(-1)[1]++; }
  console.log(`${wrong ? 'FAIL' : 'ok  '} ${title}: ${runs.map(([w, n]) => `${w}×${n}`).join(' ')}${wrong ? `  (${wrong} wrong frames, first at ${firstWrong})` : ''} | locked:${!!st.held}`);
  return wrong;
}
const N = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
let fails = 0;
// 1. Locked on A standing still; B walks across in front (bigger), hiding A for a while.
for (const [label, bB] of [['different build', bodyB], ['SAME build as A', bodyA], ['no build visible', null]]) {
  fails += run(`B crosses in front of locked A (${label})`, [
    { people: [person('A', 0.5, 0.1, bodyA)], hold: true },
    ...N(30, () => ({ people: [person('A', 0.5, 0.1, bodyA)], want: 'A' })),
    ...N(80, (i) => { const bx = 0.05 + i * 0.011; const hidden = Math.abs(bx - 0.5) < 0.07;
      return { people: [...(hidden ? [] : [person('A', 0.5, 0.1, bodyA, Math.abs(bx - 0.5) < 0.12 ? UPPER : null)]), person('B', bx, 0.13, bB)], want: 'A' }; }),
    ...N(20, () => ({ people: [person('A', 0.5, 0.1, bodyA), person('B', 0.95, 0.13, bB)], want: 'A' })),
  ]);
}
// 2. Locked A walks behind B, who stands still.
fails += run('Locked A walks behind standing B', [
  { people: [person('A', 0.25, 0.1, bodyA), person('B', 0.6, 0.12, bodyB)], hold: true, lock: { x: 0.25, y: 0.35 } },
  ...N(80, (i) => { const ax = 0.25 + i * 0.008; const hidden = Math.abs(ax - 0.6) < 0.06;
    return { people: [...(hidden ? [] : [person('A', ax, 0.1, bodyA)]), person('B', 0.6, 0.12, bodyB)], want: 'A' }; }),
]);
// 3. Locked A leaves left; stranger C walks in and stands center; A comes back left.
fails += run('Locked A leaves, stranger takes center, A returns', [
  { people: [person('A', 0.3, 0.1, bodyA)], hold: true },
  ...N(40, () => ({ people: [person('A', 0.3, 0.1, bodyA)], want: 'A' })),
  ...N(25, (i) => ({ people: [person('A', 0.3 - i * 0.012, 0.1, bodyA)], want: 'A' })),
  ...N(30, () => ({ people: [] })),
  ...N(90, (i) => ({ people: [person('C', Math.max(0.5, 0.95 - i * 0.02), 0.1, bodyC)], want: 'A' })),
  ...N(30, (i) => ({ people: [person('A', 0.04 + i * 0.006, 0.1, bodyA), person('C', 0.5, 0.1, bodyC)], want: 'A' })),
]);
// 4. Same, A comes back on the far right (build only).
fails += run('Locked A leaves left, returns on the right', [
  { people: [person('A', 0.3, 0.1, bodyA)], hold: true },
  ...N(40, () => ({ people: [person('A', 0.3, 0.1, bodyA)], want: 'A' })),
  ...N(25, (i) => ({ people: [person('A', 0.3 - i * 0.012, 0.1, bodyA)], want: 'A' })),
  ...N(40, () => ({ people: [person('C', 0.5, 0.1, bodyC)], want: 'A' })),
  ...N(30, (i) => ({ people: [person('A', 0.95 - i * 0.004, 0.1, bodyA), person('C', 0.5, 0.1, bodyC)], want: 'A' })),
]);
// 5. Side by side, close, both still, for a long time.
fails += run('Locked A with B standing close beside', [
  { people: [person('A', 0.45, 0.1, bodyA), person('B', 0.55, 0.1, bodyB)], hold: true, lock: { x: 0.45, y: 0.35 } },
  ...N(300, () => ({ people: [person('A', 0.45, 0.1, bodyA), person('B', 0.55, 0.1, bodyB)], want: 'A' })),
]);
// 6. Operator clicks B while locked on A: switches and stays on B.
fails += run('Operator picks B while locked on A', [
  { people: [person('A', 0.3, 0.1, bodyA), person('B', 0.7, 0.1, bodyB)], hold: true, lock: { x: 0.3, y: 0.35 } },
  ...N(20, () => ({ people: [person('A', 0.3, 0.1, bodyA), person('B', 0.7, 0.1, bodyB)], want: 'A' })),
  { people: [person('A', 0.3, 0.1, bodyA), person('B', 0.7, 0.1, bodyB)], lock: { x: 0.7, y: 0.35 }, hold: true, want: 'B' },
  ...N(60, (i) => ({ people: [person('A', 0.3 + i * 0.007, 0.1, bodyA), person('B', 0.7 - i * 0.007, 0.1, bodyB)].filter((p) => true), want: 'B' })),
]);

// 8. A walks right while B (same build) walks left in front of them; A hidden while they overlap.
for (const locked of [true, false]) {
  fails += run(`Walking A crosses same-build B coming the other way (${locked ? 'locked' : 'not locked'})`, [
    { people: [person('A', 0.2, 0.1, bodyA), person('B', 0.8, 0.13, bodyA)], hold: locked, lock: { x: 0.2, y: 0.35 } },
    ...N(90, (i) => { const ax = 0.2 + i * 0.007, bx = 0.8 - i * 0.007; const hidden = Math.abs(ax - bx) < 0.08;
      return { people: [...(hidden ? [] : [person('A', ax, 0.1, bodyA)]), person('B', bx, 0.13, bodyA)], want: 'A' }; }),
  ]);
}
// 7. Not locked: A leaves for good, then C is picked (old behaviour kept).
{
  const st = { cfg: { missFrames: 10, holdMatch: 0.6 } }; let now = 0, last;
  for (let i = 0; i < 20; i++) { pick(st, [person('A', 0.5, 0.1, bodyA)], now); now += 66; }
  for (let i = 0; i < 15; i++) { last = pick(st, [person('C', 0.85, 0.1, bodyC)], now); now += 66; }
  const ok = last && last.name === 'C'; if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} Not locked: speaker gone for good, picks the next person`);
}
console.log(fails ? `${fails} FAILURES` : "all scenarios pass");
if (fails) process.exit(1);
