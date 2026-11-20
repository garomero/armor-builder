// Movement guides: original animated figures plus coaching notes (paraphrased, not copied).
import { esc, icon } from './ui.js';
import { bellPlan, bellText } from './program.js';

// ---------- figure model ----------
// Body poses (absolute coords in a 300×290 box, ground at y=262). Facing right.
const BODY = {
  stand:   { hd: [150, 84],  s: [150, 106], h: [150, 172], k1: [153, 216], a1: [151, 260], k2: [147, 216], a2: [145, 260] },
  setup:   { hd: [198, 150], s: [182, 160], h: [120, 192], k1: [166, 222], a1: [152, 260], k2: [162, 222], a2: [146, 260] },
  hinge:   { hd: [204, 130], s: [188, 142], h: [116, 182], k1: [162, 222], a1: [152, 260], k2: [158, 222], a2: [146, 260] },
  squat:   { hd: [150, 142], s: [142, 164], h: [112, 228], k1: [184, 222], a1: [152, 260], k2: [180, 224], a2: [146, 260] },
  kneel:   { hd: [150, 114], s: [150, 136], h: [150, 204], k1: [184, 206], a1: [182, 260], k2: [150, 256], a2: [112, 258] },
  walkA:   { hd: [150, 84],  s: [150, 106], h: [150, 172], k1: [164, 216], a1: [172, 260], k2: [140, 218], a2: [128, 258] },
  walkB:   { hd: [150, 84],  s: [150, 106], h: [150, 172], k1: [140, 218], a1: [128, 258], k2: [164, 216], a2: [172, 260] },
  hang:    { hd: [150, 92],  s: [150, 114], h: [150, 180], k1: [152, 220], a1: [150, 250], k2: [148, 220], a2: [146, 250] },
  rowhinge:{ hd: [208, 138], s: [192, 148], h: [124, 168], k1: [156, 218], a1: [150, 260], k2: [150, 218], a2: [144, 260] },
};
// Arm poses as offsets from the shoulder.
const ARM = {
  down:    { e: [0, 34],   w: [0, 64] },
  rack:    { e: [14, 34],  w: [18, 10] },
  lock:    { e: [4, -34],  w: [2, -64] },
  hike:    { e: [-20, 30], w: [-48, 66] },
  float:   { e: [26, 16],  w: [52, 12] },
  goblet:  { e: [12, 34],  w: [20, 14] },
  rowHang: { e: [2, 38],   w: [2, 70] },
  rowPull: { e: [-26, 8],  w: [-12, 36] },
  brace:   { e: [-6, 36],  w: [-28, 62] },
  up:      { e: [10, -32], w: [16, -62] },
  swingL:  { e: [6, 32],   w: [10, 62] },
};

function pose(f) {
  const b = BODY[f.b];
  const n = ARM[f.n], fa = ARM[f.f || f.n];
  const add = (p, o, dx = 0, dy = 0) => [p[0] + o[0] + dx, p[1] + o[1] + dy];
  return {
    ...b,
    e1: add(b.s, n.e), w1: add(b.s, n.w),
    e2: add(b.s, fa.e, -3, 2), w2: add(b.s, fa.w, -3, 2),
    bells: f.bells || 'both', bar: f.b === 'hang',
  };
}
const JOINTS = ['hd', 's', 'h', 'k1', 'a1', 'k2', 'a2', 'e1', 'w1', 'e2', 'w2'];
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

function bellAt(e, w) {
  const dx = w[0] - e[0], dy = w[1] - e[1];
  const L = Math.hypot(dx, dy) || 1;
  return [w[0] + (dx / L) * 10, w[1] + (dy / L) * 10];
}
function bellSvg(c, cls) {
  const [x, y] = c;
  return `<path class="fig-handle ${cls}" d="M${x - 6} ${y - 7} Q${x} ${y - 17} ${x + 6} ${y - 7}"/><circle class="fig-bell ${cls}" cx="${x}" cy="${y}" r="10"/>`;
}
function drawPose(q) {
  const pt = (p) => p.map((v) => v.toFixed(1)).join(',');
  const toe = (a) => [a[0] + 20, a[1]];
  let s = `<line class="fig-ground" x1="40" y1="262" x2="260" y2="262"/>`;
  if (q.bar) s += `<line class="fig-bar" x1="105" y1="${(q.w1[1] - 4).toFixed(1)}" x2="200" y2="${(q.w1[1] - 4).toFixed(1)}"/>`;
  // far side (lighter)
  s += `<polyline class="fig-far" points="${pt(toe(q.a2))} ${pt(q.a2)} ${pt(q.k2)} ${pt(q.h)}"/>`;
  s += `<polyline class="fig-far" points="${pt(q.s)} ${pt(q.e2)} ${pt(q.w2)}"/>`;
  if (q.bells === 'both' || q.bells === 'far') s += bellSvg(bellAt(q.e2, q.w2), 'far');
  // near side
  s += `<polyline class="fig-near" points="${pt(toe(q.a1))} ${pt(q.a1)} ${pt(q.k1)} ${pt(q.h)} ${pt(q.s)}"/>`;
  s += `<circle class="fig-head" cx="${q.hd[0].toFixed(1)}" cy="${q.hd[1].toFixed(1)}" r="13"/>`;
  s += `<polyline class="fig-near" points="${pt(q.s)} ${pt(q.e1)} ${pt(q.w1)}"/>`;
  if (q.bells === 'both' || q.bells === 'near') s += bellSvg(bellAt(q.e1, q.w1), 'near');
  if (q.bells === 'goblet') {
    const m = lerp(q.w1, q.w2, 0.5);
    s += bellSvg([m[0] + 4, m[1] + 4], 'near');
  }
  return s;
}

export class Figure {
  constructor(svg, frames, { onStep, speed = 1 } = {}) {
    this.svg = svg; this.frames = frames; this.onStep = onStep; this.speed = speed;
    this.i = 0; this.t = 0; this.playing = true; this.last = null;
    this.loop = this.loop.bind(this);
    this.render(pose(frames[0]));
    this.onStep?.(0);
    requestAnimationFrame(this.loop);
  }
  render(q) { this.svg.innerHTML = drawPose(q); }
  loop(ts) {
    if (!this.svg.isConnected) return; // stop once removed from the page
    if (this.last == null) this.last = ts;
    const dt = Math.min(0.1, (ts - this.last) / 1000);
    this.last = ts;
    const n = this.frames.length;
    const cur = this.frames[this.i];
    const D = cur.hold ?? 1.3, MV = 0.6;
    if (this.playing && n > 1) {
      this.t += dt * this.speed;
      if (this.t >= D) { this.t = 0; this.i = (this.i + 1) % n; this.onStep?.(this.i); }
    }
    const A = pose(this.frames[this.i]);
    const B = pose(this.frames[(this.i + 1) % n]);
    const u = this.playing && n > 1 ? ease(Math.max(0, Math.min(1, (this.t - (D - MV)) / MV))) : 0;
    const q = { bells: u < 0.5 ? A.bells : B.bells, bar: A.bar };
    for (const j of JOINTS) q[j] = lerp(A[j], B[j], u);
    this.render(q);
    requestAnimationFrame(this.loop);
  }
  toggle() { this.playing = !this.playing; this.t = 0; return this.playing; }
  step(d) {
    this.playing = false; this.t = 0;
    this.i = (this.i + d + this.frames.length) % this.frames.length;
    this.onStep?.(this.i);
  }
}

// ---------- guide library ----------
const F = (b, n, cap, extra = {}) => ({ b, n, cap, ...extra });

export const GUIDES = [
  {
    id: 'abc', name: 'Armor Building Complex (ABC)', cat: 'Main lifts', bell: 'abc', pair: true,
    summary: '2 double cleans → 1 double press → 3 double front squats. Park the bells. That is one round.',
    frames: [
      F('setup', 'down', 'Set up: bells between your feet, hinge and grip both handles.'),
      F('hinge', 'hike', 'Clean 1: hike the bells back high between your legs.'),
      F('stand', 'rack', 'Snap the hips and float the bells into the rack.'),
      F('hinge', 'hike', 'Clean 2: back into the hike pass.'),
      F('stand', 'rack', 'Rack again. Glutes and abs tight.'),
      F('stand', 'lock', 'Press once to a full lockout.'),
      F('stand', 'rack', 'Lower under control to the rack.'),
      F('squat', 'rack', 'Front squat 1: sit between your heels.'),
      F('stand', 'rack', 'Stand tall.'),
      F('squat', 'rack', 'Front squat 2.'),
      F('stand', 'rack', 'Stand tall.'),
      F('squat', 'rack', 'Front squat 3.'),
      F('stand', 'rack', 'Stand tall, then park the bells.'),
      F('setup', 'down', 'Set the bells down "like a professional." Shake out.'),
    ],
    setup: ['Two bells of the same weight between your feet, handles angled slightly back.', 'Feet about hip to shoulder width. Hinge back and grip both handles.'],
    execute: ['Two cleans: each one starts with a hike pass back.', 'One strict press from the rack to lockout.', 'Three front squats from the rack.', 'Hinge and set the bells down with control.'],
    finish: ['On the EMOM clock, rest until the next minute begins.', 'Count rounds, not reps. The squats add up fast.'],
    cues: ['The press is the hard part. Make that one rep beautiful.', 'Move your feet between parts if you need to.', 'Bells down like a professional.'],
    faults: [
      ['Rushing the clean into the press', 'Own the rack for a breath before pressing.'],
      ['Pressing with a big lean back', 'Squeeze glutes, ribs down. If you still lean, the bells are too heavy today.'],
      ['Squats getting shallow late in the session', 'Slow down the descent. Stop adding rounds when depth goes.'],
    ],
    easier: 'Fewer rounds. Rest longer between rounds (every 90 s instead of every minute).',
    harder: 'More rounds first, then a heavier pair. Later: hit the same rounds in less time.',
  },
  {
    id: 'double-clean', name: 'Double kettlebell clean', cat: 'Main lifts', bell: 'abc', pair: true,
    summary: 'A swing that finishes in the rack. Hips do the work; arms stay loose.',
    frames: [
      F('setup', 'down', 'Start: bells between your feet, hinge and grip.'),
      F('hinge', 'hike', 'Hike pass: forearms close to the groin, bells high and back.'),
      F('stand', 'rack', 'Snap the hips. Bells float close and land in the rack.'),
      F('hinge', 'hike', 'Let them drop back into the hike pass.'),
      F('stand', 'rack', 'Rack: glutes tight, knees locked, wrists straight.'),
    ],
    setup: ['Bells a foot in front of you, handles angled back.', 'Hinge: hips back, flat back, shins close to vertical. Grip both handles.'],
    execute: ['Hike both bells back between your legs, high and tight (like a football hike).', 'Drive the hips forward and let the bells travel up close to your body.', 'Keep the elbows quiet: guide the bells around your hands into the rack. Don\'t curl them.'],
    finish: ['Rack: bells rest on the outside of the forearms, elbows against the ribs, wrists straight.', 'Absorb the landing with tight glutes and abs. Don\'t re-bend the knees.'],
    cues: ['It\'s a swing that ends in the rack.', 'Tame the arc: keep the bells close.', 'Quiet elbows, zip up the finish.'],
    faults: [
      ['Bells bang your forearms', 'The arc is too wide. Keep them closer and punch your hand through as they arrive.'],
      ['Starting from a dead hang', 'Always begin from a hike pass back.'],
      ['Curling the bells up with the arms', 'Let the hips throw them. Arms are ropes.'],
      ['Soft knees at the top', 'Stand tall and squeeze the glutes as the bells land.'],
    ],
    easier: 'Single-bell clean, one side at a time. Or practise two-hand swings first.',
    harder: 'A heavier pair. Or pause in the rack for 3 seconds after each clean.',
  },
  {
    id: 'double-press', name: 'Double kettlebell press', cat: 'Main lifts', bell: 'press', pair: true,
    summary: 'Dan\'s favourite KB lift. Every rep starts at the chest and finishes at full lockout.',
    frames: [
      F('stand', 'rack', 'Rack both bells. Stand tall, glutes and abs braced.'),
      F('stand', 'lock', 'Press both bells to lockout, biceps by the ears.'),
      F('stand', 'rack', 'Pull them back down to the chest under control.'),
    ],
    setup: ['Clean both bells to the rack.', 'Feet hip-width, glutes tight, ribs down, head neutral.'],
    execute: ['Press both bells up and slightly out, keeping each elbow stacked under its wrist.', 'Keep your head still. Finish with the arms locked and the bells over your shoulders.'],
    finish: ['Lower back to the chest each rep. Pause there briefly.', 'On 2-3-5-10 ladders, put the bells down between mini-sets.'],
    cues: ['Stay tall.', 'Elbow under wrist.', 'Head up and quiet.'],
    faults: [
      ['Leaning back to finish the rep', 'Squeeze glutes harder. If it persists, use the lighter pair for that rung.'],
      ['Bells drifting forward', 'Pull the bells down with your lats on the way down; press back over the shoulders.'],
      ['Chin pokes forward', 'Make a double chin. Let the bells pass your face.'],
    ],
    easier: 'Alternating or see-saw press (each shoulder gets a tiny rest). Or use 2-3-5 ladders without the 10s.',
    harder: 'Touchdown press. Or a load ladder: heavier pair for the 2s and 3s.',
  },
  {
    id: 'double-front-squat', name: 'Double kettlebell front squat', cat: 'Main lifts', bell: 'abc', pair: true,
    summary: 'Squat with both bells in the rack. The armor builder for the legs and trunk.',
    frames: [
      F('stand', 'rack', 'Rack both bells, feet a little wider than hips.'),
      F('squat', 'rack', 'Sit down between your heels, chest proud.'),
      F('stand', 'rack', 'Drive up through the whole foot and stand tall.'),
    ],
    setup: ['Bells in the rack, elbows tucked.', 'Feet slightly wider than the hips, toes turned out a little.'],
    execute: ['Break at hips and knees together and sit down between your heels.', 'Keep the elbows inside the knees and the chest up.', 'Stand up by pushing the floor away.'],
    finish: ['Lock out tall with glutes squeezed. Breathe at the top.'],
    cues: ['Move your feet until the squat feels right.', 'Chest proud, elbows in.', 'Breathe at the top, brace for the trip down.'],
    faults: [
      ['Heels lift', 'Widen the stance or turn the toes out a bit more.'],
      ['Knees cave in', 'Push the knees out over the toes.'],
      ['Rounding at the bottom', 'Only go as deep as you can keep a long spine. Goblet squat holds help.'],
    ],
    easier: 'Goblet squat with one bell.',
    harder: 'Heavier pair, or a 2-second pause at the bottom.',
  },
  {
    id: 'alt-press', name: 'Alternating press', cat: 'Press variations', bell: 'press', pair: true,
    summary: 'Press one bell up and down, then the other. The resting bell waits in the rack.',
    frames: [
      F('stand', 'rack', 'Both bells in the rack.'),
      F('stand', 'lock', 'Press the near bell up.', { f: 'rack' }),
      F('stand', 'rack', 'Lower it back to the rack.'),
      F('stand', 'rack', 'Press the far bell up.', { f: 'lock' }),
      F('stand', 'rack', 'Lower it. That\'s one rep each side.'),
    ],
    setup: ['Clean both bells to the rack and brace.'],
    execute: ['Press one bell to lockout and lower it to the rack.', 'Then press the other. Keep the resting bell tight in the rack.'],
    finish: ['Count one side only (Dan starts on the left and counts the right).'],
    cues: ['No side-to-side lean.', 'Resting bell stays glued to you.', 'Chin, sternum and zipper in one line.'],
    faults: [['Shifting the hips to each side', 'Brace the trunk harder; go lighter if needed.']],
    easier: 'Single-arm press with one bell.',
    harder: 'See-saw or touchdown press.',
  },
  {
    id: 'see-saw', name: 'See-saw press', cat: 'Press variations', bell: 'press', pair: true,
    summary: 'As one bell goes up, the other comes down. Shoulder-friendly rhythm.',
    frames: [
      F('stand', 'rack', 'Both bells in the rack.'),
      F('stand', 'lock', 'Press the near bell up.', { f: 'rack' }),
      F('stand', 'rack', 'Lower it while the far bell goes up.', { f: 'lock' }),
      F('stand', 'lock', 'And switch again: see-saw.', { f: 'rack' }),
    ],
    setup: ['Clean both bells, press one to lockout to start.'],
    execute: ['Lower the top bell while the other presses up, at the same time.', 'Find a smooth rhythm.'],
    finish: ['Bring both bells to the rack to finish.'],
    cues: ['Independent suspension: each shoulder works on its own.', 'Smooth, not rushed.'],
    faults: [['Rocking the torso', 'Slow down and brace.']],
    easier: 'Alternating press.',
    harder: 'Touchdown press.',
  },
  {
    id: 'touchdown', name: 'Touchdown press', cat: 'Press variations', bell: 'press', pair: true,
    summary: 'Both bells overhead, then lower and press one at a time while the other stays locked out.',
    frames: [
      F('stand', 'lock', 'Both bells locked out overhead.'),
      F('stand', 'rack', 'Lower the near bell only.', { f: 'lock' }),
      F('stand', 'lock', 'Press it back up.'),
      F('stand', 'lock', 'Lower the far bell only.', { f: 'rack' }),
      F('stand', 'lock', 'Press it back up.'),
    ],
    setup: ['Clean and press both bells to lockout.'],
    execute: ['Keep one bell locked out while the other comes down to the rack and back up.', 'Alternate sides.'],
    finish: ['Lower both to the rack to end the set.'],
    cues: ['Tougher than it looks.', 'Locked arm stays straight and stacked.'],
    faults: [['One side much weaker', 'Skip this variation until the sides even out.']],
    easier: 'See-saw press.',
    harder: 'A heavier pair.',
  },
  {
    id: 'single-press', name: 'Single-arm press (half-kneeling)', cat: 'Press variations', bell: 'warm', pair: false,
    summary: 'One bell, one arm. Kneeling stretches the hip flexor and makes your trunk do its job.',
    frames: [
      F('kneel', 'rack', 'Half-kneel. Bell in the rack on the same side as the down knee.', { f: 'down', bells: 'near' }),
      F('kneel', 'lock', 'Press to lockout. Elbow under wrist the whole way.', { f: 'down', bells: 'near' }),
      F('kneel', 'rack', 'Lower under control.', { f: 'down', bells: 'near' }),
    ],
    setup: ['Half-kneel, squeeze the glute of the down leg.', 'Bell in the rack on that side.'],
    execute: ['Press straight up, elbow stacked under the wrist.', 'Keep the chin, sternum and zipper in one vertical line.'],
    finish: ['Lower to the rack. Do all reps on one side, then switch.'],
    cues: ['If you start twisting, stop.', 'Free hand makes a fist.', 'Stand version: same rules, feet hip-width.'],
    faults: [['Leaning away from the bell', 'Lighter bell, or shorter set.']],
    easier: 'Standing press, or floor press.',
    harder: 'Waiter press, then bottoms-up press.',
  },
  {
    id: 'swing', name: 'Two-hand swing', cat: 'Warm-up and extras', bell: 'warm', pair: false,
    summary: 'The hinge that powers the clean. Hike, snap, float.',
    frames: [
      F('hinge', 'hike', 'Hike the bell back between your legs.', { f: 'hike', bells: 'goblet' }),
      F('stand', 'float', 'Snap the hips. The bell floats to chest height.', { f: 'float', bells: 'goblet' }),
    ],
    setup: ['Bell a foot in front of you. Hinge and grip with both hands.'],
    execute: ['Hike it back high between the legs.', 'Snap the hips forward to stand tall; the bell floats.', 'Let it fall back and hinge to meet it.'],
    finish: ['Stand tall at the top: glutes tight, knees locked, arms loose.'],
    cues: ['It\'s a hinge, not a squat.', 'Attack the zipper on the way down.', 'Plank at the top.'],
    faults: [['Squatting the swing', 'Hips go back, shins stay vertical.'], ['Lifting with the arms', 'Arms are ropes; hips do the work.']],
    easier: 'Kettlebell deadlift.',
    harder: 'One-hand swing.',
  },
  {
    id: 'goblet-squat', name: 'Goblet squat', cat: 'Warm-up and extras', bell: 'warm', pair: false,
    summary: 'Dan John\'s own invention. Hold one bell by the horns at your chest and squat between your heels.',
    frames: [
      F('stand', 'goblet', 'Hold the bell by the horns against your chest.', { bells: 'goblet' }),
      F('squat', 'goblet', 'Sit down between your heels, elbows inside the knees.', { bells: 'goblet' }),
      F('stand', 'goblet', 'Stand tall.', { bells: 'goblet' }),
    ],
    setup: ['Bell held upside down by the horns, against the chest.'],
    execute: ['Squat down, letting the elbows slide inside the knees.', 'Use the elbows to push the knees out at the bottom.'],
    finish: ['Stand tall. In the warm-up, also hold the bottom for 30 seconds.'],
    cues: ['Elbows inside the knees.', 'Chest up.', 'Sit between your heels, not behind them.'],
    faults: [['Heels lifting', 'Widen the stance.']],
    easier: 'Squat to a box.',
    harder: 'Double front squat.',
  },
  {
    id: 'goblet-hold', name: 'Goblet squat hold', cat: 'Warm-up and extras', bell: 'warm', pair: false,
    summary: 'Daily mobility: sit in the bottom of a goblet squat for 30 seconds. Pry the hips gently.',
    frames: [F('squat', 'goblet', 'Sit at the bottom. Breathe. Gently pry the knees out with your elbows.', { bells: 'goblet' })],
    setup: ['Light bell by the horns.'],
    execute: ['Lower into the bottom of a goblet squat and stay there 30 seconds.', 'Shift side to side to explore the hips.'],
    finish: ['Stand up slowly.'],
    cues: ['Relax into it.', 'Chest up, heels down.'],
    faults: [['Pain in the knees', 'Come up a little higher.']],
    easier: 'Hold a door frame or post for balance, no bell.',
    harder: 'Longer hold.',
  },
  {
    id: 'hang', name: 'Bar hang (or child\'s pose)', cat: 'Warm-up and extras', bell: null, pair: false,
    summary: 'Daily mobility: straight-arm hang from a bar for 30 seconds. No bar? Child\'s pose.',
    frames: [F('hang', 'up', 'Hang with straight arms. Relax the shoulders, breathe.', { bells: 'none' })],
    setup: ['Grip an overhead bar, hands shoulder-width.'],
    execute: ['Lift your feet and hang for 30 seconds.'],
    finish: ['Step down softly.'],
    cues: ['Long spine.', 'Easy breathing.'],
    faults: [['Grip gives out fast', 'Shorter hangs, more often. Keep your toes on a box.']],
    easier: "Child's pose: kneel, sit back on your heels, reach your arms forward on the floor.",
    harder: 'Longer hangs.',
  },
  {
    id: 'farmer', name: 'Farmer carry', cat: 'Carries', bell: 'farmer', pair: true,
    summary: 'Heavy bell in each hand. Walk tall. Dan\'s "king" of carries.',
    frames: [
      F('walkA', 'down', 'Stand tall with a heavy bell in each hand.'),
      F('walkB', 'down', 'Walk with short, steady steps.'),
    ],
    setup: ['Deadlift the bells up with a flat back. Stand tall.'],
    execute: ['Walk with short steps, shoulders down and back, eyes forward.'],
    finish: ['Set the bells down with a hinge, not a slouch.'],
    cues: ['Stay tall.', 'Crush the handles.', 'Breathe behind the brace.'],
    faults: [['Shoulders shrugged up', 'Pull the shoulders down into your back pockets.']],
    easier: 'Shorter distance.',
    harder: 'Farther first, then heavier.',
  },
  {
    id: 'suitcase', name: 'Suitcase carry', cat: 'Carries', bell: 'suitcase', pair: false,
    summary: 'One bell, one hand. The core works to stop you leaning. Down with one hand, back with the other.',
    frames: [
      F('walkA', 'down', 'One bell in one hand. Stand perfectly upright.', { bells: 'near', f: 'swingL' }),
      F('walkB', 'down', 'Walk without leaning toward or away from the bell.', { bells: 'near', f: 'swingL' }),
    ],
    setup: ['Pick the bell up with a hinge.'],
    execute: ['Walk tall. Your empty hand stays loose.'],
    finish: ['Turn, switch hands, walk back.'],
    cues: ['Don\'t lean.', 'Zipper vertical.', 'Shoulders level.'],
    faults: [['Leaning away from the bell', 'Lighter bell or shorter walk.']],
    easier: 'Lighter bell.',
    harder: 'Heavier bell, longer distance.',
  },
  {
    id: 'rack', name: 'Rack carry', cat: 'Carries', bell: 'rack', pair: true,
    summary: 'Both bells in the rack. Teaches you to breathe while braced.',
    frames: [
      F('walkA', 'rack', 'Clean both bells to the rack.'),
      F('walkB', 'rack', 'Walk tall. Breathe behind the brace.'),
    ],
    setup: ['Clean both bells to the rack.'],
    execute: ['Walk with short steps, elbows tucked, ribs down.'],
    finish: ['Lower the bells with control.'],
    cues: ['Short breaths behind a tight brace.', 'Don\'t lean back.'],
    faults: [['Leaning back to hold the bells', 'Lighter pair.']],
    easier: 'Single-bell rack carry.',
    harder: 'Heavier pair.',
  },
  {
    id: 'row', name: 'Kettlebell row', cat: 'Warm-up and extras', bell: 'row', pair: false,
    summary: 'Single-arm bent-over row. Balances all the pressing.',
    frames: [
      F('rowhinge', 'rowHang', 'Hinge with your free hand braced on your thigh. Bell hangs.', { f: 'brace', bells: 'near' }),
      F('rowhinge', 'rowPull', 'Pull the bell to your hip, elbow close to your body.', { f: 'brace', bells: 'near' }),
    ],
    setup: ['Staggered stance, free hand on your front thigh, flat back.'],
    execute: ['Row the bell toward the hip, not the chest.', 'Pause at the top. Lower slowly.'],
    finish: ['All reps on one side, then switch.'],
    cues: ['Elbow to the back pocket.', 'Flat back.', 'No twisting.'],
    faults: [['Yanking with the body', 'Lighter bell, pause at the top.']],
    easier: 'Lighter bell.',
    harder: 'Pause rows, 3 seconds at the top.',
  },
];

export const guideById = (id) => GUIDES.find((g) => g.id === id);

// Render the full guide as HTML (used by the Guides page and the in-session sheet).
export function guideHtml(g, S) {
  const bp = bellPlan(S);
  const w = g.bell ? bp[g.bell] : null;
  const bellLine = g.bell ? `<p class="bell-hint">${icon('kb')}<span>Your bell: <b>${esc(bellText(w, g.pair))}</b></span></p>` : '';
  const list = (arr) => `<ol class="steps">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
  return `
    <p class="lede">${esc(g.summary)}</p>
    ${bellLine}
    <div class="fig-wrap">
      <svg class="fig" viewBox="0 0 300 290" role="img" aria-label="${esc(g.name)} animation"></svg>
      <p class="fig-cap" data-cap></p>
      <div class="fig-ctl">
        <button class="btn icon-btn" data-fig="prev" aria-label="Previous position">${icon('prev')}</button>
        <button class="btn" data-fig="play">${icon('pause')}<span>Pause</span></button>
        <button class="btn icon-btn" data-fig="next" aria-label="Next position">${icon('next')}</button>
        <label class="speed">Speed <input type="range" min="0.5" max="2" step="0.25" value="1" data-fig="speed"></label>
      </div>
    </div>
    <h3>3 key cues</h3>
    <ul class="cues">${g.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <h3>Setup</h3>${list(g.setup)}
    <h3>Execution</h3>${list(g.execute)}
    <h3>Finish</h3>${list(g.finish)}
    <h3>Common faults</h3>
    <dl class="faults">${g.faults.map(([f, x]) => `<dt>${esc(f)}</dt><dd>${esc(x)}</dd>`).join('')}</dl>
    <div class="grid2">
      <div class="mini"><span class="mini-l">Easier</span>${esc(g.easier)}</div>
      <div class="mini"><span class="mini-l">Harder</span>${esc(g.harder)}</div>
    </div>`;
}

export function wireGuide(root, g) {
  const svg = root.querySelector('svg.fig');
  const cap = root.querySelector('[data-cap]');
  const fig = new Figure(svg, g.frames, {
    onStep: (i) => { cap.textContent = `${i + 1}/${g.frames.length} · ${g.frames[i].cap}`; },
  });
  const playBtn = root.querySelector('[data-fig="play"]');
  const setPlay = (on) => { playBtn.innerHTML = `${icon(on ? 'pause' : 'play')}<span>${on ? 'Pause' : 'Play'}</span>`; };
  root.querySelector('[data-fig="prev"]').onclick = () => { fig.step(-1); setPlay(false); };
  root.querySelector('[data-fig="next"]').onclick = () => { fig.step(1); setPlay(false); };
  playBtn.onclick = () => setPlay(fig.toggle());
  root.querySelector('[data-fig="speed"]').oninput = (e) => { fig.speed = Number(e.target.value); };
  return fig;
}

// Bottom sheet with a guide, used mid-session.
export function openGuideSheet(id, S) {
  const g = guideById(id);
  if (!g) return;
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(g.name)}">
    <div class="sheet-head"><h2>${esc(g.name)}</h2><button class="btn icon-btn" data-close aria-label="Close">${icon('close')}</button></div>
    <div class="sheet-body">${guideHtml(g, S)}</div></div>`;
  document.body.appendChild(wrap);
  wireGuide(wrap, g);
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
}
