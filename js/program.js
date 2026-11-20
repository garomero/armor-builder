// The "Dan John brain": program calendars, targets, bell choices and nudge rules.
// Rules are paraphrased from The Armor Building Formula (I and II). No book text is reproduced.

export const DEFAULTS = {
  onboarded: false,
  program: 'abf4fl',          // 'abf4fl' (fat loss) | 'classic'
  startDate: null,            // ISO date of Day 1 (week 1 starts here)
  liftDays: [1, 3, 5],        // 0=Sun … 6=Sat; three lifting days, middle one is the hard day
  walkDay: 2,                 // ABF4FL long fasted walk
  ruckDay: 6,                 // ABF4FL optional ruck
  timeWeekday: '19:00',
  timeWeekend: '10:00',
  bodyweight: null,           // lb
  height: null,               // in
  bells: [],                  // every bell owned, in lb, e.g. [25,25,35,35,45,50,50]
  load: { abc: null, press: null, pressHeavy: null, scheme: '2-3-5-10', loadLadder: false },
  loadCheckDone: false,
  restSec: 60,
  sound: true,
  stepsTarget: 10000,
  proteinTarget: null,        // g/day; derived from bodyweight if null
  pinHash: null,
  lastBackup: null,
};

export const SCHEMES = {
  '2-3-5-10': [2, 3, 5, 10],
  '2-3-5': [2, 3, 5],
  '2-3-2-3': [2, 3, 2, 3],
};

// ---------- dates ----------
const DAY = 864e5;
export function iso(d = new Date()) {
  const z = new Date(d);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`;
}
export function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
export function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / DAY); }
export function nextMonday(from = new Date()) {
  const d = new Date(from);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 1 ? 0 : (8 - dow) % 7));
  return iso(d);
}
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function proteinTarget(S) {
  if (S.proteinTarget) return S.proteinTarget;
  if (!S.bodyweight) return null;
  return Math.min(150, Math.round((S.bodyweight * 0.45359237 * 1.5) / 5) * 5); // 1.5 g/kg, capped ~150
}

// ---------- bells ----------
export function bellPlan(S) {
  const count = {};
  for (const b of S.bells || []) count[b] = (count[b] || 0) + 1;
  const uniq = Object.keys(count).map(Number).sort((a, b) => a - b);
  const pairs = uniq.filter((w) => count[w] >= 2);
  const heaviest = uniq.length ? uniq[uniq.length - 1] : null;
  const lightPair = pairs.length ? pairs[0] : null;
  const nextPair = (w) => pairs.find((p) => p > w) ?? null;
  const abc = S.load?.abc ?? lightPair;
  const press = S.load?.press ?? lightPair;
  const between = uniq.filter((w) => w < heaviest && w > (lightPair ?? 0));
  const suitcase = between.length ? between[between.length - 1] : heaviest;
  return {
    pairs, uniq,
    single: pairs.length ? null : (uniq[0] ?? null),
    abc, press,
    abcNext: abc != null ? nextPair(abc) : null,
    pressNext: press != null ? nextPair(press) : null,
    pressHeavy: S.load?.loadLadder ? (S.load.pressHeavy ?? (press != null ? nextPair(press) : null)) : null,
    rack: lightPair != null ? (nextPair(lightPair) ?? lightPair) : heaviest,
    farmer: pairs.length ? pairs[pairs.length - 1] : heaviest,
    farmerIsPair: pairs.length > 0,
    suitcase,
    row: suitcase,
    warm: lightPair ?? uniq[0] ?? null,
  };
}
export function kg(lb) { return Math.round(lb * 0.45359237); }
export function bellText(w, pair = false) {
  if (w == null) return 'your bell';
  return `${pair ? '2 × ' : ''}${w} lb (~${kg(w)} kg)`;
}

// ---------- history context ----------
export function ctxFrom(sessions) {
  const done = sessions.filter((s) => s.status === 'done').sort((a, b) => (a.date + a.startedAt).localeCompare(b.date + b.startedAt));
  let lastAbc = null, lastPress = null, bestAbc = 0, bestPress = 0;
  for (const s of done) {
    for (const b of s.blocks) {
      if (b.type === 'abc' && b.done?.rounds) {
        lastAbc = { rounds: b.done.rounds, rpe: s.rpe, crisp: s.crisp, date: s.date, target: b.target };
        bestAbc = Math.max(bestAbc, b.done.rounds);
      }
      if (b.type === 'press' && b.done?.sets?.length) {
        const reps = b.done.sets.reduce((a, x) => a + (x.reps || 0), 0);
        lastPress = { reps, rpe: s.rpe, crisp: s.crisp, date: s.date, scheme: b.done.scheme };
        bestPress = Math.max(bestPress, reps);
      }
    }
  }
  return { done, lastAbc, lastPress, bestAbc, bestPress };
}

const RPE_WORD = { easy: 'felt easy', right: 'felt right', grind: 'was a grind' };
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Dan's "nudge": raise the floor a little at a time. Never jump on a grind or sloppy reps.
function suggestAbc(ctx, lo, hi, first) {
  if (!ctx.lastAbc) return { n: clamp(first, lo, hi), why: 'First ABC: start light and own every rep. Technique first.' };
  const L = ctx.lastAbc;
  let inc = L.rpe === 'easy' ? 2 : L.rpe === 'grind' ? 0 : 1;
  if (L.crisp === false) inc = Math.min(inc, 0);
  const n = clamp(L.rounds + inc, lo, hi);
  const why = `Last ABC: ${L.rounds} rounds and it ${RPE_WORD[L.rpe] || 'was logged'}${L.crisp === false ? ', with some sloppy reps' : ''}. Today: ${n}. Nudge, don't jump.`;
  return { n, why };
}

// ---------- block builders ----------
const W = () => ({ type: 'warmup' });
const WALK = (min = 15, max = 30) => ({ type: 'walk', min, max });
const CARRY = {
  farmer: (sets = 3) => ({ type: 'carry', kind: 'farmer', sets, dist: '40 yd' }),
  suitcase: (sets = 3) => ({ type: 'carry', kind: 'suitcase', sets, dist: 'Down with one hand, back with the other' }),
  rack: (sets = 3) => ({ type: 'carry', kind: 'rack', sets, dist: '40 yd' }),
};
const PRESS = (S, ladders, max, why) => ({ type: 'press', ladders, max, scheme: S.load?.scheme || '2-3-5-10', why });
const ABC = (n, lo, hi, why) => ({ type: 'abc', target: n, lo, hi, why });

// ---------- ABF for Fat Loss ----------
function abf4fl(week, slot, S, ctx) {
  const pressWeek = week % 4 === 0;
  if (!pressWeek) {
    const [lo, hi] = week < 4 ? [3, 10] : [6, 15];
    const s = suggestAbc(ctx, lo, hi, slot === 0 ? 3 : 5);
    const carry = [CARRY.farmer(3), CARRY.suitcase(week === 1 ? 2 : 3), CARRY.rack(3)][slot];
    const blocks = [W(), ABC(s.n, lo, hi, s.why), carry];
    if (slot === 1 && week >= 3) blocks.push({ type: 'row', sets: 3, reps: 8, optional: true });
    blocks.push(WALK());
    return { title: 'ABC + carries', sub: `Target ${s.n} rounds · one per minute`, blocks, why: s.why };
  }
  if (slot === 1) {
    const s = suggestAbc(ctx, 10, 30, 10);
    return { title: 'Big ABC day', sub: `${s.n} rounds (10–30 as appropriate)`, blocks: [W(), ABC(s.n, 10, 30, s.why), CARRY.rack(3), WALK()], why: s.why };
  }
  const ladders = slot === 0 ? (week === 4 ? 2 : 3) : (week === 4 ? 3 : 4);
  const max = slot === 0 ? 3 : 5;
  const why = pressNote(ctx, ladders, max);
  return { title: 'Press day', sub: `${ladders} ladders of ${S.load?.scheme || '2-3-5-10'} (up to ${max})`, blocks: [W(), PRESS(S, ladders, max, why), slot === 0 ? CARRY.farmer(3) : CARRY.suitcase(3), WALK()], why };
}

function pressNote(ctx, ladders, max) {
  if (!ctx.lastPress) return `Aim for ${ladders} ladders, up to ${max} if every rep is crisp. Stop a ladder early rather than grind.`;
  const L = ctx.lastPress;
  return `Last press day: ${L.reps} reps and it ${RPE_WORD[L.rpe] || 'was logged'}. Aim for ${ladders} ladders; add one (up to ${max}) only if the 10s stay clean.`;
}

// ---------- Classic ABF (8 weeks) ----------
// Each slot: o = order ('P','A','PA','AP'); p = [ladders, max]; a = [lo, hi]
const CLASSIC = {
  1: [{ o: 'PA', p: [1, 2], a: [5, 8] }, { o: 'AP', p: [1, 2], a: [5, 8] }, { o: 'PA', p: [1, 2], a: [5, 8] }],
  2: [{ o: 'AP', p: [1, 2], a: [5, 8] }, { o: 'PA', p: [1, 2], a: [5, 8] }, { o: 'AP', p: [1, 2], a: [5, 8] }],
  3: [{ o: 'P', p: [2, 2] }, { o: 'A', a: [15, 20] }, { o: 'P', p: [2, 2] }],
  4: [{ o: 'A', a: [12, 12] }, { o: 'P', p: [2, 3] }, { o: 'A', a: [10, 10] }],
  5: [{ o: 'P', p: [1, 2] }, { o: 'A', a: [20, 25] }, { o: 'P', p: [1, 2] }],
  6: [{ o: 'A', a: [15, 15] }, { o: 'P', p: [3, 4] }, { o: 'A', a: [12, 12] }],
  7: [{ o: 'P', p: [3, 3] }, { o: 'A', a: [30, 30] }, { o: 'P', p: [2, 2] }],
  8: [{ o: 'A', a: [15, 15] }, { o: 'P', p: [5, 5] }, { o: 'A', a: [20, 20] }],
};
function classic(week, slot, S, ctx) {
  const c = CLASSIC[week][slot];
  const blocks = [W()];
  let abcWhy = '';
  for (const ch of c.o) {
    if (ch === 'P') blocks.push(PRESS(S, c.p[0], c.p[1], pressNote(ctx, c.p[0], c.p[1])));
    if (ch === 'A') {
      const s = suggestAbc(ctx, c.a[0], c.a[1], c.a[0]);
      abcWhy = s.why;
      blocks.push(ABC(s.n, c.a[0], c.a[1], s.why));
    }
  }
  blocks.push(WALK(20, 30));
  const hard = slot === 1 && week >= 3;
  let title = c.o.length === 2 ? 'Practice day: press + ABC' : c.o === 'P' ? 'Press day' : 'ABC day';
  if (hard) title = (c.o === 'P' ? 'Hard press day' : 'Hard ABC day');
  if (week === 7 && slot === 1) title = 'Goal day: 30 ABC rounds';
  if (week === 8 && slot === 1) title = 'Goal day: 100 presses';
  const abc = blocks.find((b) => b.type === 'abc');
  const press = blocks.find((b) => b.type === 'press');
  const sub = [press && `${press.ladders} ladder${press.ladders > 1 ? 's' : ''} of press`, abc && `${abc.target} ABC rounds`].filter(Boolean).join(' · ');
  return { title, sub, blocks, why: abcWhy || press?.why || '' };
}

// ---------- day plan ----------
export function planFor(date, S, ctx) {
  if (!S.startDate) return { kind: 'none' };
  const d = daysBetween(S.startDate, date);
  if (d < 0) return { kind: 'pre', daysTo: -d, title: 'Program starts soon', sub: `Day 1 is ${-d} day${-d === 1 ? '' : 's'} away. Walk daily and practise the warm-up.` };
  const week = Math.floor(d / 7) + 1;
  if (week > 8) return { kind: 'done', week, title: 'Block complete', sub: 'Take a week easy, then start the next block from Settings.' };
  const dow = parseISO(date).getDay();
  const days = [...S.liftDays].sort((a, b) => a - b);
  const slot = days.indexOf(dow);
  if (slot >= 0) {
    const p = S.program === 'classic' ? classic(week, slot, S, ctx) : abf4fl(week, slot, S, ctx);
    return { kind: 'lift', week, slot, hard: slot === 1, ...p };
  }
  if (S.program === 'abf4fl' && dow === S.walkDay) {
    return { kind: 'walk', week, title: 'Long walk + mobility', sub: '45–60 min, ideally fasted', blocks: [{ type: 'walk', min: 45, max: 60, fasted: true }, { type: 'mobility' }] };
  }
  if (S.program === 'abf4fl' && dow === S.ruckDay) {
    return { kind: 'ruck', week, title: 'Optional ruck', sub: '30–45 min with a light pack', blocks: [{ type: 'ruck', min: 30, max: 45 }] };
  }
  if (S.program === 'classic') {
    return { kind: 'walk', week, title: 'Walk day', sub: 'Easy walk, 30+ min. Hit your steps.', blocks: [{ type: 'walk', min: 30, max: 45 }] };
  }
  return { kind: 'rest', week, title: 'Recovery', sub: 'Still hit your steps. Did I walk? Did I train? Did I eat like an adult?' };
}

export function weekOf(date, S) {
  if (!S.startDate) return null;
  const d = daysBetween(S.startDate, date);
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
}

// ---------- descriptions ----------
const CARRY_NAME = { farmer: 'Farmer carry', suitcase: 'Suitcase carry', rack: 'Rack carry' };
export function describeBlock(b, S) {
  const bp = bellPlan(S);
  switch (b.type) {
    case 'warmup': return { t: 'Warm-up (1-2-3-4-5)', d: 'Breathe · hang + squat hold · journal · compass · 5 movements', g: 'hang' };
    case 'abc': {
      const bells = bp.abc != null ? bellText(bp.abc, true) : bp.single != null ? `${bellText(bp.single)} (single-bell ABC)` : 'your bells';
      return { t: `Armor Building Complex × ${b.target}`, d: `${bells} · 2 cleans → 1 press → 3 front squats, one round per minute`, g: 'abc' };
    }
    case 'press': {
      const reps = SCHEMES[b.scheme].reduce((a, x) => a + x, 0) * b.ladders;
      const heavy = bp.pressHeavy ? ` · ${bp.pressHeavy} lb pair for the 2s and 3s` : '';
      return { t: `Double press: ${b.ladders} × ${b.scheme}`, d: `${reps} reps · ${bellText(bp.press, true)}${heavy}`, g: 'double-press' };
    }
    case 'carry': {
      const w = b.kind === 'farmer' ? bp.farmer : b.kind === 'rack' ? bp.rack : bp.suitcase;
      const pair = b.kind === 'suitcase' ? false : (b.kind === 'farmer' ? bp.farmerIsPair : true);
      return { t: `${CARRY_NAME[b.kind]} × ${b.sets}`, d: `${bellText(w, pair)} · ${b.dist}`, g: b.kind };
    }
    case 'row': return { t: `KB row ${b.sets} × ${b.reps} each arm (optional)`, d: bellText(bp.row), g: 'row' };
    case 'walk': return { t: `Walk ${b.min}–${b.max} min`, d: b.fasted ? 'Ideally fasted. Easy pace, nose breathing.' : 'Lift first, then walk.', g: null };
    case 'ruck': return { t: `Ruck ${b.min}–${b.max} min`, d: 'Light pack, 5–30 lb. Tall posture, easy breathing.', g: null };
    case 'mobility': return { t: 'Mobility / floor work', d: '10–15 min: nods, rocking, bird dogs, crawling, hip flexors', g: 'goblet-hold' };
    default: return { t: b.type, d: '' };
  }
}

export const WARMUP_MOVES = [
  { k: 'push', name: 'Push', text: 'Light press, 5 each arm', g: 'single-press' },
  { k: 'pull', name: 'Pull', text: 'Row 5 each arm (or ring/TRX row)', g: 'row' },
  { k: 'hinge', name: 'Hinge', text: '10 two-hand swings', g: 'swing' },
  { k: 'squat', name: 'Squat', text: '5 goblet squats', g: 'goblet-squat' },
  { k: 'carry', name: 'Carry', text: 'Suitcase carry down and back (or march in place)', g: 'suitcase' },
];
export const MOBILITY = [
  'Head nods × 10',
  'Rock back and forth on hands and knees × 20',
  'Bird dogs × 5 each side',
  'Cross-crawl march, 1 min',
  'Crawl (bear or baby crawl), 1–2 min',
  'Half-kneeling hip-flexor stretch, 30 s each side',
  'Deep squat sit / goblet hold, 30 s',
];

// ---------- summaries ----------
export function summarize(s) {
  const r = { abc: 0, cleans: 0, presses: 0, squats: 0, pressReps: 0, carrySets: 0, walkMin: 0 };
  for (const b of s.blocks || []) {
    const d = b.done || {};
    if (b.type === 'abc') r.abc += d.rounds || 0;
    if (b.type === 'press') r.pressReps += (d.sets || []).reduce((a, x) => a + (x.reps || 0), 0);
    if (b.type === 'carry' || b.type === 'row') r.carrySets += d.sets || 0;
    if (b.type === 'walk' || b.type === 'ruck') r.walkMin += d.minutes || 0;
  }
  r.cleans = r.abc * 2;
  r.squats = r.abc * 3;
  r.presses = r.abc + r.pressReps;
  return r;
}

// Epley estimate, per hand: weight × (1 + reps/30)
export function estMax(sessions) {
  let best = 0;
  for (const s of sessions) for (const b of s.blocks || []) {
    if (b.type !== 'press') continue;
    for (const set of b.done?.sets || []) if (set.bell && set.reps) best = Math.max(best, set.bell * (1 + set.reps / 30));
  }
  return best ? Math.round(best) : null;
}

// Load check, offered at the end of week 2.
export function loadCheckDue(S, ctx, today) {
  if (S.loadCheckDone || !S.startDate) return false;
  const wk = weekOf(today, S);
  if (wk >= 3) return true;
  if (wk === 2) {
    const wk2 = ctx.done.filter((s) => weekOf(s.date, S) === 2 && s.kind === 'lift');
    return wk2.length >= 3;
  }
  return false;
}
