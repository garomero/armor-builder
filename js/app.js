// Armor Builder: app shell, router and views.
import { db, persistStorage } from './db.js';
import * as P from './program.js';
import { GUIDES, guideById, guideHtml, wireGuide } from './guides.js';
import { Player } from './player.js';
import { esc, $, $$, icon, ICONS, toast, fmt, lineChart, barChart, movingAvg, download, sha256, setSound, unlockAudio } from './ui.js';

const app = $('#app');
let S = null;          // settings
let player = null;     // active Player while in a session

// ---------- data ----------
async function loadSettings() {
  const r = await db.get('kv', 'settings');
  const v = r?.v || {};
  S = { ...structuredClone(P.DEFAULTS), ...v, load: { ...P.DEFAULTS.load, ...(v.load || {}) } };
  setSound(S.sound);
}
async function saveSettings() { await db.put('kv', { k: 'settings', v: S }); setSound(S.sound); }
async function getSessions() { return (await db.all('sessions')).sort((a, b) => (a.date + a.startedAt).localeCompare(b.date + b.startedAt)); }
async function getCheckins() { return (await db.all('checkins')).sort((a, b) => a.date.localeCompare(b.date)); }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const PROGRAM_NAME = { abf4fl: 'ABF for Fat Loss', classic: 'Classic ABF' };
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

// ---------- router ----------
const routes = { today, session, guides, guide, progress, more, checkin, history, ask, calendar, backup, settings, privacy };

async function route() {
  if (player) { player.unmount(); player = null; }
  document.body.classList.remove('in-session');
  app.onclick = app.oninput = app.onchange = null;
  const [name = 'today', ...args] = location.hash.replace(/^#\/?/, '').split('/');
  if (S.pinHash && sessionStorage.getItem('unlocked') !== '1') return lockView();
  if (!S.onboarded) return onboard();
  const view = routes[name] || today;
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === (['checkin', 'history', 'ask', 'calendar', 'backup', 'settings', 'privacy'].includes(name) ? 'more' : name === 'guide' ? 'guides' : name)));
  try {
    await view(...args.map(decodeURIComponent));
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="page"><div class="card warn"><h2>Something went wrong</h2><p>${esc(err.message)}</p><a class="btn" href="#/today">Back to Today</a></div></div>`;
  }
  if (name !== 'session') window.scrollTo(0, 0);
}

// ---------- Today ----------
async function today() {
  const date = P.iso();
  const all = await getSessions();
  const ctx = P.ctxFrom(all);
  const plan = P.planFor(date, S, ctx);
  const active = (await db.get('kv', 'active'))?.v;
  const doneToday = ctx.done.filter((s) => s.date === date);
  const ck = await db.get('checkins', date);
  const pt = P.proteinTarget(S);
  const week = P.weekOf(date, S);

  let main = '';
  if (active) {
    main += `<div class="card accent"><h3>Session in progress</h3><p>${esc(active.title)} · ${fmt.dateShort(active.date)}</p>
      <a class="btn primary" href="#/session">${icon('play')}<span>Resume</span></a></div>`;
  }
  if (plan.kind === 'none') main += `<div class="card"><p>Set a start date in Settings.</p></div>`;
  else {
    const blocks = plan.blocks ? plan.blocks.map((b) => {
      const d = P.describeBlock(b, S);
      return `<li><b>${esc(d.t)}</b><span class="muted sm">${esc(d.d)}</span></li>`;
    }).join('') : '';
    const canStart = plan.blocks && !active;
    const doneHtml = doneToday.length
      ? `<div class="done-line">${icon('check')}<span>Logged today: ${doneToday.map((s) => esc(sessionLine(s))).join('; ')}</span></div>` : '';
    main += `<div class="card today ${plan.hard ? 'hard' : ''}">
      <div class="tag">${esc(kindLabel(plan))}${plan.hard ? ' · hard day' : ''}</div>
      <h2>${esc(plan.title)}</h2><p class="muted">${esc(plan.sub || '')}</p>
      ${blocks ? `<ol class="blocks">${blocks}</ol>` : ''}
      ${plan.why ? `<p class="coach">${icon('chat')}<span>${esc(plan.why)}</span></p>` : ''}
      ${doneHtml}
      ${canStart ? `<a class="btn huge primary" href="#/session">${icon('play')}<span>${doneToday.length ? 'Log another session' : 'Start session'}</span></a>` : ''}
    </div>`;
  }

  if (P.loadCheckDue(S, ctx, date)) main += loadCheckHtml();

  const stepsPct = ck?.steps ? Math.min(100, (ck.steps / S.stepsTarget) * 100) : 0;
  const protPct = ck?.protein && pt ? Math.min(100, (ck.protein / pt) * 100) : 0;
  main += `<div class="card">
    <div class="card-h"><h3>Today's habits</h3><a class="btn sm" href="#/checkin">${ck ? 'Edit' : 'Check in'}</a></div>
    <div class="habits">
      <div><span class="muted sm">Steps</span><b>${ck?.steps ? ck.steps.toLocaleString() : '–'}</b><div class="pbar thin"><span style="width:${stepsPct}%"></span></div><span class="muted xs">of ${S.stepsTarget.toLocaleString()}</span></div>
      <div><span class="muted sm">Protein</span><b>${ck?.protein ?? '–'}${ck?.protein ? ' g' : ''}</b><div class="pbar thin"><span style="width:${protPct}%"></span></div><span class="muted xs">of ${pt ?? '?'} g</span></div>
      <div><span class="muted sm">Weight</span><b>${ck?.weight ?? '–'}</b><span class="muted xs">lb</span></div>
      <div><span class="muted sm">Waist</span><b>${ck?.waist ?? '–'}</b><span class="muted xs">in</span></div>
    </div></div>`;

  if (week >= 1 && week <= 8) main += weekStripHtml(week, ctx);

  const est = P.estMax(ctx.done);
  main += `<div class="card"><h3>Progress at a glance</h3><div class="stats">
    <div class="stat"><b>${ctx.bestAbc || 0}</b><span>best ABC rounds</span></div>
    <div class="stat"><b>${ctx.bestPress || 0}</b><span>best press session</span></div>
    <div class="stat"><b>${est ? `${est} lb` : '–'}</b><span>est. 1-hand press max</span></div>
    <div class="stat"><b>${ctx.done.length}</b><span>sessions logged</span></div></div>
    <p class="muted xs">Goals: ${S.program === 'classic' ? '30 ABC rounds in ~30 min, and 100 presses in one session.' : 'steady fat loss (about 1–2 lb a month is fine), 10k steps a day, and growing ABC rounds.'}</p></div>`;

  const lastBackup = S.lastBackup ? P.daysBetween(S.lastBackup, date) : null;
  if (ctx.done.length >= 3 && (lastBackup == null || lastBackup > 30)) {
    main += `<div class="card warn"><p>${icon('download')}<span>Your history only lives on this phone. Save a backup file (it takes a few seconds).</span></p><a class="btn" href="#/backup">Back up now</a></div>`;
  }

  app.innerHTML = `<div class="page">
    <header class="top"><div><div class="muted sm">${fmt.dateLong(date)}</div>
    <h1>${week >= 1 && week <= 8 ? `Week ${week} of 8` : week > 8 ? 'Block complete' : 'Getting ready'}</h1>
    <div class="muted sm">${PROGRAM_NAME[S.program]}</div></div>
    <a class="btn icon-btn ghost" href="#/guides" aria-label="Guides">${icon('book')}</a></header>
    ${main}</div>`;

  app.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    if (t.dataset.a === 'day') {
      const d = t.dataset.d;
      if (await db.get('kv', 'active')) { toast('Finish or leave the current session first.'); return; }
      if (confirm(`Log the ${fmt.dow(d)} ${fmt.dateShort(d)} session now?`)) go(`#/session/${d}`);
    }
    if (t.dataset.a === 'lc') {
      S.loadCheck = { ...(S.loadCheck || {}), [t.dataset.q]: t.dataset.v };
      const bp = P.bellPlan(S);
      if (t.dataset.q === 'abc' && t.dataset.v === 'up' && bp.abcNext) S.load.abc = bp.abcNext;
      if (t.dataset.q === 'press') {
        if (t.dataset.v === 'ladder' && bp.pressNext) { S.load.loadLadder = true; S.load.pressHeavy = bp.pressNext; }
        if (t.dataset.v === 'short') S.load.scheme = '2-3-5';
      }
      if (S.loadCheck.abc && S.loadCheck.press) { S.loadCheckDone = true; toast('Loads updated. You can change them anytime in Settings.'); }
      await saveSettings();
      today();
    }
  };
}

function kindLabel(plan) {
  return { lift: 'Lift day', walk: 'Walk day', ruck: 'Ruck day', rest: 'Recovery', pre: 'Before day 1', done: 'Done' }[plan.kind] || '';
}

function sessionLine(s) {
  const r = P.summarize(s);
  const bits = [s.title];
  if (r.abc) bits.push(`${r.abc} ABC rounds`);
  if (r.pressReps) bits.push(`${r.pressReps} presses`);
  if (r.walkMin) bits.push(`${r.walkMin} min walk`);
  return bits.join(' · ');
}

function weekStripHtml(week, ctx) {
  const start = P.addDays(S.startDate, (week - 1) * 7);
  const todayIso = P.iso();
  let cells = '';
  for (let i = 0; i < 7; i++) {
    const d = P.addDays(start, i);
    const plan = P.planFor(d, S, ctx);
    const done = ctx.done.some((s) => s.date === d);
    const k = { lift: 'L', walk: 'W', ruck: 'R' }[plan.kind] || '·';
    const state = done ? 'done' : d === todayIso ? 'today' : d < todayIso && plan.blocks && plan.kind === 'lift' ? 'missed' : '';
    const tap = plan.blocks && !done && d <= todayIso ? `data-a="day" data-d="${d}" role="button" tabindex="0"` : '';
    cells += `<div class="day ${state} k-${plan.kind}${plan.hard ? ' hard' : ''}" ${tap}><span class="xs">${fmt.dow(d)}</span><b>${done ? '✓' : k}</b></div>`;
  }
  return `<div class="card"><div class="card-h"><h3>This week</h3><span class="muted xs">L lift · W walk · R ruck</span></div><div class="week">${cells}</div>
    <p class="muted xs">Missed a day? Tap it to log it. Dan says be flexible: slide the week, never double up.</p></div>`;
}

function loadCheckHtml() {
  const bp = P.bellPlan(S);
  const lc = S.loadCheck || {};
  const q = (key, text, opts) => `<div class="lc"><p>${text}</p><div class="chips">${opts.map(([v, l]) => `<button class="chip ${lc[key] === v ? 'on' : ''}" data-a="lc" data-q="${key}" data-v="${v}">${esc(l)}</button>`).join('')}</div></div>`;
  return `<div class="card accent"><h3>Week 2 load check</h3>
    <p class="muted sm">Dan's rule: the first two weeks are for choosing your bells. Answer honestly; staying light is a fine answer.</p>
    ${q('abc', `ABC: did 10 or more rounds on ${bp.abc} lb stay crisp at one per minute?`, [['up', bp.abcNext ? `Yes, move to ${bp.abcNext} lb` : 'Yes (no heavier pair)'], ['stay', `Stay on ${bp.abc} lb`]])}
    ${q('press', `Press: could you finish the 10s with every rep crisp?`, [['ladder', bp.pressNext ? `Easy: ${bp.pressNext} lb pair for the 2s and 3s` : 'Easy'], ['keep', 'About right'], ['short', 'The 10s were a struggle: drop to 2-3-5']])}
  </div>`;
}

// ---------- Session ----------
async function session(dateParam) {
  let active = (await db.get('kv', 'active'))?.v;
  if (!active) {
    const date = dateParam || P.iso();
    const plan = P.planFor(date, S, P.ctxFrom(await getSessions()));
    if (!plan.blocks) { toast('Nothing scheduled that day.'); go('#/today'); return; }
    active = {
      id: uid(), date, week: plan.week, slot: plan.slot, kind: plan.kind, program: S.program,
      title: plan.title, blocks: plan.blocks.map((b) => ({ ...b })), cur: 0,
      startedAt: Date.now(), status: 'active', rpe: null, crisp: null, notes: '',
    };
    await db.put('kv', { k: 'active', v: active });
  }
  document.body.classList.add('in-session');
  player = new Player(app, active, {
    S,
    onExit: () => { player = null; go('#/today'); },
    onSave: (s) => {
      player = null;
      const r = P.summarize(s);
      toast(`Saved: ${[r.abc && `${r.abc} rounds`, r.pressReps && `${r.pressReps} presses`, r.walkMin && `${r.walkMin} min walk`].filter(Boolean).join(', ') || s.title}. Now go walk.`, 4000);
      go('#/today');
    },
  });
  player.mount();
}

// ---------- Guides ----------
async function guides() {
  const cats = [...new Set(GUIDES.map((g) => g.cat))];
  app.innerHTML = `<div class="page"><header class="top"><h1>Movement guides</h1></header>
    <p class="muted">Each guide has an animated figure you can pause and step through, plus cues, faults, and the bell to use.</p>
    ${cats.map((c) => `<h2 class="sec">${esc(c)}</h2><div class="list">${GUIDES.filter((g) => g.cat === c).map((g) => `
      <a class="list-row" href="#/guide/${g.id}"><span><b>${esc(g.name)}</b><span class="muted sm">${esc(g.summary)}</span></span>${icon('next')}</a>`).join('')}</div>`).join('')}
    <h2 class="sec">Warm-up and cool-down</h2>
    <div class="card"><p><b>Warm-up (1-2-3-4-5), 5–10 min.</b> One minute of breathing; a 30 s bar hang and a 30 s goblet squat hold; a quick past/present/future journal; a life-compass check (work, rest, play, pray); one easy set of push, pull, hinge, squat and carry. It's built into every session.</p>
    <p><b>Cool-down.</b> Walk, 15–30 min, after every lifting session. Lift first, then walk.</p></div></div>`;
}

async function guide(id) {
  const g = guideById(id);
  if (!g) return go('#/guides');
  app.innerHTML = `<div class="page"><header class="top"><a class="btn icon-btn ghost" href="#/guides" aria-label="Back">${icon('back')}</a><h1>${esc(g.name)}</h1></header>${guideHtml(g, S)}</div>`;
  wireGuide(app, g);
}

// ---------- Check-in ----------
async function checkin(dateParam) {
  const date = dateParam || P.iso();
  const ck = (await db.get('checkins', date)) || { date };
  const recent = (await getCheckins()).slice(-10).reverse();
  const photos = (await db.all('photos')).filter((p) => p.date === date);
  const yn = (k, label) => `<button type="button" class="chip ${ck[k] ? 'on' : ''}" data-a="yn" data-k="${k}">${label}</button>`;
  const num = (k, label, unit, step = 'any', mode = 'decimal') => `<label class="field"><span>${label}</span><span class="in"><input type="number" inputmode="${mode}" step="${step}" min="0" data-k="${k}" value="${ck[k] ?? ''}"><span class="unit">${unit}</span></span></label>`;
  app.innerHTML = `<div class="page"><header class="top"><a class="btn icon-btn ghost" href="#/more" aria-label="Back">${icon('back')}</a><h1>Daily check-in</h1></header>
    <label class="field"><span>Date</span><input type="date" id="ck-date" value="${date}" max="${P.iso()}"></label>
    <div class="grid2">${num('weight', 'Weight', 'lb')}${num('waist', 'Waist', 'in')}${num('steps', 'Steps', '', '1', 'numeric')}${num('protein', 'Protein', 'g', '1', 'numeric')}${num('sleep', 'Sleep', 'h')}</div>
    <p class="muted xs">Dan measures the waist in cm, daily, for finer feedback: ${ck.waist ? `${(ck.waist * 2.54).toFixed(1)} cm` : 'the app converts it for you'}. Keep it under half your height${S.height ? ` (${(S.height / 2).toFixed(1)} in)` : ''}.</p>
    <h3>Did I…</h3><div class="chips">${yn('walked', 'Walk')}${yn('trained', 'Train')}${yn('ateWell', 'Eat like an adult')}</div>
    <label class="field"><span>Notes</span><textarea data-k="notes" rows="2" placeholder="Compliments received, clothes fit, energy, cravings">${esc(ck.notes || '')}</textarea></label>
    <div class="row"><button class="btn primary" data-a="save">${icon('check')}<span>Save check-in</span></button>
    <label class="btn">${icon('camera')}<span>Add progress photo</span><input type="file" accept="image/*" id="photo" hidden></label></div>
    <div class="photos">${photos.map((p) => `<img alt="Progress photo" data-pid="${p.id}">`).join('')}</div>
    <h2 class="sec">Recent</h2>
    <div class="list">${recent.map((c) => `<a class="list-row" href="#/checkin/${c.date}"><span><b>${fmt.dateShort(c.date)}</b><span class="muted sm">${[c.weight && `${c.weight} lb`, c.waist && `${c.waist} in`, c.steps && `${c.steps.toLocaleString()} steps`, c.protein && `${c.protein} g protein`].filter(Boolean).join(' · ') || 'no numbers'}</span></span>${icon('next')}</a>`).join('') || '<p class="muted">No check-ins yet.</p>'}</div></div>`;
  for (const img of $$('img[data-pid]', app)) {
    const p = photos.find((x) => x.id === img.dataset.pid);
    img.src = URL.createObjectURL(p.blob);
  }
  $('#ck-date').onchange = (e) => go(`#/checkin/${e.target.value}`);
  $('#photo').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const blob = await shrinkImage(file);
    await db.put('photos', { id: uid(), date, blob, added: Date.now() });
    toast('Photo saved on this phone.');
    checkin(date);
  };
  app.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    if (t.dataset.a === 'yn') { ck[t.dataset.k] = !ck[t.dataset.k]; t.classList.toggle('on', ck[t.dataset.k]); return; }
    if (t.dataset.a === 'save') {
      for (const inp of $$('input[data-k]', app)) ck[inp.dataset.k] = inp.value === '' ? null : Number(inp.value);
      ck.notes = $('textarea[data-k="notes"]', app).value;
      ck.updated = Date.now();
      await db.put('checkins', ck);
      toast('Check-in saved.');
      go('#/today');
    }
  };
}

async function shrinkImage(file, max = 1100) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.82));
  } catch { return file; }
}

// ---------- Progress ----------
async function progress() {
  const all = await getSessions();
  const ctx = P.ctxFrom(all);
  const cks = await getCheckins();
  const done = ctx.done;
  const tot = done.reduce((a, s) => { const r = P.summarize(s); a.abc += r.abc; a.presses += r.presses; a.squats += r.squats; a.walk += r.walkMin; return a; }, { abc: 0, presses: 0, squats: 0, walk: 0 });

  const abcPts = [], pressPts = [];
  for (const s of done) for (const b of s.blocks) {
    if (b.type === 'abc' && b.done?.rounds) abcPts.push({ label: fmt.dateShort(s.date), y: b.done.rounds });
    if (b.type === 'press' && b.done?.sets?.length) pressPts.push({ label: fmt.dateShort(s.date), y: b.done.sets.reduce((a, x) => a + x.reps, 0) });
  }
  const weeks = [];
  for (let w = 1; w <= 8; w++) {
    const r = done.filter((s) => s.week === w).map(P.summarize).reduce((a, x) => a + x.squats + x.presses + x.cleans, 0);
    weeks.push({ label: `W${w}`, y: r, hi: P.weekOf(P.iso(), S) === w });
  }
  const wts = cks.filter((c) => c.weight != null);
  const wAvg = movingAvg(wts.map((c) => c.weight));
  const waists = cks.filter((c) => c.waist != null);
  const last14 = Array.from({ length: 14 }, (_, i) => P.addDays(P.iso(), i - 13));
  const byDate = Object.fromEntries(cks.map((c) => [c.date, c]));
  const pt = P.proteinTarget(S);
  const first = wts[0], lastW = wts[wts.length - 1];
  const wDelta = first && lastW && first !== lastW ? (lastW.weight - first.weight).toFixed(1) : null;
  const firstWaist = waists[0], lastWaist = waists[waists.length - 1];
  const waistDelta = firstWaist && lastWaist && firstWaist !== lastWaist ? (lastWaist.waist - firstWaist.waist).toFixed(1) : null;
  const est = P.estMax(done);
  const photos = (await db.all('photos')).sort((a, b) => a.date.localeCompare(b.date));

  app.innerHTML = `<div class="page"><header class="top"><h1>Progress</h1></header>
    <div class="stats">
      <div class="stat"><b>${done.length}</b><span>sessions</span></div>
      <div class="stat"><b>${tot.abc}</b><span>ABC rounds</span></div>
      <div class="stat"><b>${tot.presses}</b><span>presses</span></div>
      <div class="stat"><b>${tot.squats}</b><span>squats</span></div>
      <div class="stat"><b>${wDelta == null ? '–' : `${wDelta > 0 ? '+' : ''}${wDelta}`}</b><span>lb since start</span></div>
      <div class="stat"><b>${waistDelta == null ? '–' : `${waistDelta > 0 ? '+' : ''}${waistDelta}`}</b><span>in waist</span></div>
      <div class="stat"><b>${est ? `${est}` : '–'}</b><span>est. press max (lb/hand)</span></div>
      <div class="stat"><b>${tot.walk}</b><span>logged walk min</span></div>
    </div>
    <div class="card"><h3>ABC rounds per session</h3>${lineChart([{ points: abcPts }], { zero: true, goal: S.program === 'classic' ? 30 : null })}</div>
    <div class="card"><h3>Presses per press session</h3>${lineChart([{ points: pressPts }], { zero: true, goal: S.program === 'classic' ? 100 : null })}</div>
    <div class="card"><h3>Weekly volume (cleans + presses + squats)</h3>${barChart(weeks)}</div>
    <div class="card"><h3>Weight (lb)</h3><p class="muted xs">Dots are daily weigh-ins; the line is the 7-day average. Watch the trend, not the day.</p>
      ${lineChart([{ points: wts.map((c) => ({ label: fmt.dateShort(c.date), y: c.weight })), cls: 'line-b', dots: true }, { points: wts.map((c, i) => ({ label: fmt.dateShort(c.date), y: wAvg[i] })), cls: 'line-a', dots: false }], { digits: 1 })}</div>
    <div class="card"><h3>Waist (in)</h3>${lineChart([{ points: waists.map((c) => ({ label: fmt.dateShort(c.date), y: c.waist })) }], { digits: 1, goal: S.height ? S.height / 2 : null })}</div>
    <div class="card"><h3>Steps, last 14 days</h3>${barChart(last14.map((d) => ({ label: fmt.dateShort(d), y: byDate[d]?.steps || 0 })), { goal: S.stepsTarget })}</div>
    <div class="card"><h3>Protein, last 14 days (g)</h3>${barChart(last14.map((d) => ({ label: fmt.dateShort(d), y: byDate[d]?.protein || 0 })), { goal: pt })}</div>
    <div class="card"><h3>Photos</h3><p class="muted xs">Before, after, and "after after." Add photos from the daily check-in. They never leave this phone.</p>
      <div class="photos">${photos.map((p) => `<figure><img alt="Progress photo ${esc(p.date)}" data-pid="${p.id}"><figcaption>${fmt.dateShort(p.date)} <button class="btn ghost icon-btn xs-btn" data-del="${p.id}" aria-label="Delete photo">${icon('trash')}</button></figcaption></figure>`).join('') || '<p class="muted">No photos yet.</p>'}</div></div>
  </div>`;
  for (const img of $$('img[data-pid]', app)) img.src = URL.createObjectURL(photos.find((p) => p.id === img.dataset.pid).blob);
  app.onclick = async (e) => {
    const del = e.target.closest('[data-del]');
    if (del && confirm('Delete this photo from your phone?')) { await db.del('photos', del.dataset.del); progress(); }
  };
}

// ---------- More ----------
async function more() {
  const row = (href, ic, title, sub) => `<a class="list-row" href="${href}">${icon(ic)}<span><b>${title}</b><span class="muted sm">${sub}</span></span>${icon('next')}</a>`;
  app.innerHTML = `<div class="page"><header class="top"><h1>More</h1></header><div class="list">
    ${row('#/checkin', 'scale', 'Daily check-in', 'Weight, waist, steps, protein, sleep, photos')}
    ${row('#/history', 'list', 'Session history', 'Every session you have logged')}
    ${row('#/ask', 'chat', 'Ask Claude', 'Copy your training summary into the Claude app')}
    ${row('#/calendar', 'calendar', 'Reminders', 'Add your schedule and alarms to your phone calendar')}
    ${row('#/backup', 'download', 'Backup and restore', 'Save or restore your data file; CSV export')}
    ${row('#/settings', 'gear', 'Settings', 'Program, schedule, bells, timers, PIN lock')}
    ${row('#/privacy', 'shield', 'Privacy and security', 'Where your data lives')}
  </div></div>`;
}

async function history() {
  const all = (await getSessions()).filter((s) => s.status === 'done').reverse();
  app.innerHTML = `<div class="page"><header class="top"><a class="btn icon-btn ghost" href="#/more" aria-label="Back">${icon('back')}</a><h1>History</h1></header>
    ${all.map((s) => `<details class="card hist"><summary><span><b>${fmt.dateShort(s.date)} · ${esc(s.title)}</b><span class="muted sm">${esc(sessionLine(s).replace(`${s.title} · `, '').replace(s.title, ''))} ${s.rpe ? `· ${{ easy: 'easy', right: 'just right', grind: 'grind' }[s.rpe]}` : ''}</span></span></summary>
      ${detailHtml(s)}<button class="btn danger sm" data-del="${s.id}">${icon('trash')}<span>Delete</span></button></details>`).join('') || '<p class="muted">No sessions yet. Your first one is on the Today tab.</p>'}</div>`;
  app.onclick = async (e) => {
    const d = e.target.closest('[data-del]');
    if (d && confirm('Delete this session permanently?')) { await db.del('sessions', d.dataset.del); history(); }
  };
}

function detailHtml(s) {
  const lines = [];
  for (const b of s.blocks) {
    const d = b.done || {};
    if (b.type === 'abc' && d.rounds) lines.push(`ABC: ${d.rounds} rounds${d.bells ? ` with ${d.bells.filter(Boolean).join(' + ')} lb` : ''}${d.seconds ? ` in ${fmt.mmss(d.seconds)}` : ''}`);
    if (b.type === 'press' && d.sets?.length) lines.push(`Press (${d.variation || 'double'}, ${d.scheme}): ${d.sets.map((x) => x.reps).join('-')} = ${d.sets.reduce((a, x) => a + x.reps, 0)} reps`);
    if ((b.type === 'carry' || b.type === 'row') && d.sets) lines.push(`${b.kind || 'row'}: ${d.sets} sets`);
    if ((b.type === 'walk' || b.type === 'ruck') && d.minutes) lines.push(`${b.type}: ${d.minutes} min${d.pack ? ` with ${d.pack} lb` : ''}`);
  }
  if (s.crisp != null) lines.push(`Crisp reps: ${s.crisp ? 'yes' : 'some sloppy'}`);
  if (s.notes) lines.push(`Notes: ${s.notes}`);
  return `<ul class="detail">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
}

// ---------- Ask Claude ----------
async function buildPacket(question) {
  const all = await getSessions();
  const ctx = P.ctxFrom(all);
  const cks = await getCheckins();
  const since = P.addDays(P.iso(), -21);
  const plan = P.planFor(P.iso(), S, ctx);
  const days = [...S.liftDays].sort().map((d) => P.DOW[d]).join('/');
  const lines = [
    `I'm following Dan John's Armor Building Formula (${PROGRAM_NAME[S.program]}). Coach me using his principles: reasonable, repeatable, doable; volume before load; nudge, don't jump; lift then walk; eat protein and vegetables.`,
    '',
    `Profile: ${S.bodyweight ?? '?'} lb, ${S.height ?? '?'} in tall. Protein target ${P.proteinTarget(S) ?? '?'} g/day. Steps target ${S.stepsTarget}.`,
    `Bells owned (lb): ${S.bells.join(', ') || 'not set'}. Current ABC bells: ${P.bellPlan(S).abc ?? '?'} lb pair. Press scheme: ${S.load.scheme}${S.load.loadLadder ? ' with load ladder' : ''}.`,
    `Program: started ${S.startDate}, now week ${P.weekOf(P.iso(), S)} of 8. Lift days ${days}.`,
    `Today's plan: ${plan.title || plan.kind}${plan.sub ? ` (${plan.sub})` : ''}.`,
    '',
    'Recent sessions (last 3 weeks):',
    ...ctx.done.filter((s) => s.date >= since).map((s) => `- ${s.date}: ${sessionLine(s)}; felt ${s.rpe || '?'}; crisp ${s.crisp == null ? '?' : s.crisp ? 'yes' : 'no'}${s.notes ? `; notes: ${s.notes}` : ''}`),
    '',
    'Daily check-ins (last 3 weeks):',
    ...cks.filter((c) => c.date >= since).map((c) => `- ${c.date}: weight ${c.weight ?? '–'}, waist ${c.waist ?? '–'} in, steps ${c.steps ?? '–'}, protein ${c.protein ?? '–'} g, sleep ${c.sleep ?? '–'} h${c.notes ? `, notes: ${c.notes}` : ''}`),
    '',
    `My question: ${question || '(none, just review my progress and tell me what to adjust)'}`,
  ];
  return lines.join('\n');
}

async function ask() {
  app.innerHTML = `<div class="page"><header class="top"><a class="btn icon-btn ghost" href="#/more" aria-label="Back">${icon('back')}</a><h1>Ask Claude</h1></header>
    <p class="muted">No API key needed. This builds a short summary of your profile, the last 3 weeks of sessions and check-ins, and your question. It copies the summary so you can paste it into the Claude app.</p>
    <label class="field"><span>Your question</span><textarea id="q" rows="3" placeholder="My quads are wrecked after ABC days. Should I hold rounds steady this week?"></textarea></label>
    <div class="row wrap"><button class="btn primary" data-a="copy">${icon('chat')}<span>Copy and open Claude</span></button><button class="btn" data-a="preview">Preview</button></div>
    <pre class="packet" id="packet" hidden></pre></div>`;
  app.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const text = await buildPacket($('#q').value.trim());
    if (t.dataset.a === 'preview') { const p = $('#packet'); p.textContent = text; p.hidden = false; return; }
    try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into Claude.'); } catch { const p = $('#packet'); p.textContent = text; p.hidden = false; toast('Copy blocked: select the text below and copy it.'); return; }
    window.open('https://claude.ai/new', '_blank', 'noopener');
  };
}

// ---------- Calendar reminders (.ics) ----------
function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
async function buildIcs() {
  const ctx = P.ctxFrom(await getSessions());
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Armor Builder//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Armor Building'];
  for (let i = 0; i < 56; i++) {
    const d = P.addDays(S.startDate, i);
    const plan = P.planFor(d, S, ctx);
    if (!plan.blocks) continue;
    const dow = P.parseISO(d).getDay();
    const time = (dow === 0 || dow === 6 ? S.timeWeekend : S.timeWeekday).replace(':', '');
    const mins = plan.kind === 'lift' ? 75 : plan.kind === 'ruck' ? 45 : 60;
    const end = new Date(P.parseISO(d).getTime() + (Number(time.slice(0, 2)) * 60 + Number(time.slice(2)) + mins) * 60000);
    const endStr = `${P.iso(end).replace(/-/g, '')}T${String(end.getHours()).padStart(2, '0')}${String(end.getMinutes()).padStart(2, '0')}00`;
    const desc = plan.kind === 'lift' ? `${plan.sub}. Warm-up, lift, then walk 15-30 min. Open Armor Builder to start.` : plan.sub;
    L.push('BEGIN:VEVENT', `UID:${d}-${plan.kind}@armor-builder`, `DTSTAMP:${stamp}`, `DTSTART:${d.replace(/-/g, '')}T${time}00`, `DTEND:${endStr}`,
      `SUMMARY:${icsEscape(`ABF W${plan.week}: ${plan.title}`)}`, `DESCRIPTION:${icsEscape(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(plan.kind === 'lift' ? 'Session in 30 min. Light protein snack now.' : 'Walk time soon.')}`, 'TRIGGER:-PT30M', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Start now', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  L.push('BEGIN:VEVENT', `UID:checkin-${S.startDate}@armor-builder`, `DTSTAMP:${stamp}`, `DTSTART:${S.startDate.replace(/-/g, '')}T210000`, `DTEND:${S.startDate.replace(/-/g, '')}T211000`,
    'RRULE:FREQ=DAILY;COUNT=56', 'SUMMARY:ABF daily check-in', `DESCRIPTION:${icsEscape('Weight, waist, steps, protein, sleep. Did I walk? Did I train? Did I eat like an adult?')}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Daily check-in', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return L.join('\r\n');
}

async function calendar() {
  app.innerHTML = `<div class="page"><header class="top"><a class="btn icon-btn ghost" href="#/more" aria-label="Back">${icon('back')}</a><h1>Reminders</h1></header>
    <p>Phones don't reliably let a web app fire alarms while it's closed, so reminders go through your calendar.</p>
    <div class="card"><h3>What gets added</h3><ul class="detail">
      <li>Every session for your 8 weeks: weekdays at ${esc(S.timeWeekday)}, weekends at ${esc(S.timeWeekend)}, with an alert 30 minutes before and one at start time.</li>
      <li>A daily ${'21:00'} check-in reminder for the 8 weeks.</li></ul>
      <button class="btn primary" data-a="ics">${icon('calendar')}<span>Download calendar file</span></button>
      <p class="muted xs">Open the downloaded file and choose "Add all." On iPhone, it opens in Calendar; on Android, open it with Google Calendar. If you change your schedule, delete the old events and download again.</p></div>
    <div class="card"><h3>In the app</h3><p class="muted sm">During a session the app beeps at each minute, counts down rest, and vibrates. Keep the screen on the session; it stays awake automatically.</p></div></div>`;
  app.onclick = async (e) => {
    if (!e.target.closest('[data-a="ics"]')) return;
    if (!S.startDate) { toast('Set a start date first.'); return; }
    download('armor-building-schedule.ics', await buildIcs(), 'text/calendar');
  };
}

// ---------- Backup ----------
function dataUrlToBlob(url) {
  const [head, b64] = url.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
async function backup() {
  app.innerHTML = `<div class="page"><header class="top"><a class="btn icon-btn ghost" href="#/more" aria-label="Back">${icon('back')}</a><h1>Backup and restore</h1></header>
    <p class="muted">Your data lives only on this phone. Clearing browser data or losing the phone erases it, so save a backup file now and then (the app reminds you monthly). Keep it somewhere private, like your own cloud drive.</p>
    <div class="card"><h3>Back up</h3><div class="row wrap">
      <button class="btn primary" data-a="json">${icon('download')}<span>Save backup file</span></button>
      <button class="btn" data-a="csv">${icon('download')}<span>Export CSV (spreadsheets)</span></button></div>
      <p class="muted xs">Last backup: ${S.lastBackup ? fmt.dateShort(S.lastBackup) : 'never'}</p></div>
    <div class="card"><h3>Restore</h3><p class="muted sm">This replaces everything on this phone with the backup's contents.</p>
      <label class="btn">${icon('upload')}<span>Choose backup file</span><input type="file" accept="application/json,.json" id="restore" hidden></label></div></div>`;
  app.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    if (t.dataset.a === 'json') {
      const photos = await db.all('photos');
      const data = {
        app: 'armor-builder', version: 1, exportedAt: new Date().toISOString(), settings: { ...S, pinHash: null },
        sessions: await db.all('sessions'), checkins: await db.all('checkins'),
        photos: await Promise.all(photos.map(async (p) => ({ id: p.id, date: p.date, added: p.added, data: await blobToDataUrl(p.blob) }))),
      };
      download(`armor-backup-${P.iso()}.json`, JSON.stringify(data), 'application/json');
      S.lastBackup = P.iso(); await saveSettings(); toast('Backup saved.');
    }
    if (t.dataset.a === 'csv') {
      const sessions = (await getSessions()).filter((s) => s.status === 'done');
      const cks = await getCheckins();
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [['type', 'date', 'week', 'title', 'abc_rounds', 'press_reps', 'squats', 'walk_min', 'rpe', 'crisp', 'weight_lb', 'waist_in', 'steps', 'protein_g', 'sleep_h', 'notes'].join(',')];
      for (const s of sessions) { const r = P.summarize(s); rows.push(['session', s.date, s.week, s.title, r.abc, r.pressReps, r.squats, r.walkMin, s.rpe, s.crisp, '', '', '', '', '', s.notes].map(q).join(',')); }
      for (const c of cks) rows.push(['checkin', c.date, P.weekOf(c.date, S), '', '', '', '', '', '', '', c.weight, c.waist, c.steps, c.protein, c.sleep, c.notes].map(q).join(','));
      download(`armor-export-${P.iso()}.csv`, rows.join('\n'), 'text/csv');
    }
  };
  $('#restore').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'armor-builder') throw new Error('That is not an Armor Builder backup file.');
      if (!confirm(`Replace all data on this phone with the backup from ${data.exportedAt?.slice(0, 10)}?`)) return;
      for (const st of ['sessions', 'checkins', 'photos']) await db.clear(st);
      for (const s of data.sessions || []) await db.put('sessions', s);
      for (const c of data.checkins || []) await db.put('checkins', c);
      for (const p of data.photos || []) await db.put('photos', { id: p.id, date: p.date, added: p.added, blob: dataUrlToBlob(p.data) });
      const pin = S.pinHash;
      S = { ...structuredClone(P.DEFAULTS), ...data.settings, pinHash: pin };
      await saveSettings();
      toast('Backup restored.');
      go('#/today');
    } catch (err) { toast(err.message || 'Could not read that file.'); }
  };
}

// ---------- Settings ----------
function profileFields() {
  const dayBoxes = (key) => P.DOW.map((d, i) => `<label class="chip-chk"><input type="checkbox" name="${key}" value="${i}" ${S.liftDays.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('');
  const daySel = (key, val) => `<select name="${key}"><option value="-1">None</option>${P.DOW.map((d, i) => `<option value="${i}" ${val === i ? 'selected' : ''}>${d}</option>`).join('')}</select>`;
  return `
    <label class="field"><span>Program</span><select name="program">
      <option value="abf4fl" ${S.program === 'abf4fl' ? 'selected' : ''}>ABF for Fat Loss (3 lift days + walks)</option>
      <option value="classic" ${S.program === 'classic' ? 'selected' : ''}>Classic ABF (30 ABC rounds / 100 presses)</option></select></label>
    <label class="field"><span>Day 1 (start date)</span><input type="date" name="startDate" value="${S.startDate || P.nextMonday()}"></label>
    <div class="field"><span>Lift days (pick 3; the middle one is the hard day)</span><div class="chips">${dayBoxes('liftDays')}</div></div>
    <div class="grid2">
      <label class="field"><span>Long walk day</span>${daySel('walkDay', S.walkDay)}</label>
      <label class="field"><span>Ruck day (optional)</span>${daySel('ruckDay', S.ruckDay)}</label>
      <label class="field"><span>Weekday time</span><input type="time" name="timeWeekday" value="${S.timeWeekday}"></label>
      <label class="field"><span>Weekend time</span><input type="time" name="timeWeekend" value="${S.timeWeekend}"></label>
      <label class="field"><span>Bodyweight (lb)</span><input type="number" inputmode="decimal" name="bodyweight" value="${S.bodyweight ?? ''}"></label>
      <label class="field"><span>Height (in)</span><input type="number" inputmode="decimal" name="height" value="${S.height ?? ''}"></label>
    </div>
    <label class="field"><span>Every kettlebell you own, in lb (list pairs twice)</span><input name="bells" placeholder="25, 25, 35, 35, 45, 50, 50" value="${S.bells.join(', ')}"></label>`;
}
function readProfile(form) {
  const f = new FormData(form);
  const lift = f.getAll('liftDays').map(Number).sort((a, b) => a - b);
  if (lift.length !== 3) throw new Error('Pick exactly 3 lift days.');
  const bells = String(f.get('bells') || '').split(/[\s,;]+/).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  if (!bells.length) throw new Error('Enter at least one kettlebell weight.');
  const oldProgram = S.program, oldStart = S.startDate;
  S.program = f.get('program');
  S.startDate = f.get('startDate');
  S.liftDays = lift;
  S.walkDay = Number(f.get('walkDay'));
  S.ruckDay = Number(f.get('ruckDay'));
  S.timeWeekday = f.get('timeWeekday') || '19:00';
  S.timeWeekend = f.get('timeWeekend') || '10:00';
  S.bodyweight = f.get('bodyweight') ? Number(f.get('bodyweight')) : null;
  S.height = f.get('height') ? Number(f.get('height')) : null;
  if (bells.join() !== S.bells.join()) { S.load = { ...S.load, abc: null, press: null, pressHeavy: null }; }
  S.bells = bells;
  if (oldProgram !== S.program || oldStart !== S.startDate) { S.loadCheckDone = false; S.loadCheck = null; }
}

async function settings() {
  const bp = P.bellPlan(S);
  const bellOpt = (cur) => bp.pairs.map((p) => `<option value="${p}" ${cur === p ? 'selected' : ''}>2 × ${p} lb</option>`).join('');
  app.innerHTML = `<div class="page"><header class="top"><a class="btn icon-btn ghost" href="#/more" aria-label="Back">${icon('back')}</a><h1>Settings</h1></header>
    <form id="f" class="card">${profileFields()}
      <h3>Loads</h3><div class="grid2">
        <label class="field"><span>ABC bells</span><select name="abc">${bellOpt(bp.abc)}</select></label>
        <label class="field"><span>Press bells</span><select name="press">${bellOpt(bp.press)}</select></label>
        <label class="field"><span>Press ladder</span><select name="scheme">${Object.keys(P.SCHEMES).map((k) => `<option ${S.load.scheme === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label class="field"><span>Load ladder (heavier pair for 2s and 3s)</span><select name="loadLadder"><option value="0">Off</option>${bp.pairs.filter((p) => p > bp.press).map((p) => `<option value="${p}" ${S.load.loadLadder && bp.pressHeavy === p ? 'selected' : ''}>On: 2 × ${p} lb</option>`).join('')}</select></label>
      </div>
      <h3>Timers and targets</h3><div class="grid2">
        <label class="field"><span>Press rest (seconds)</span><input type="number" inputmode="numeric" name="restSec" value="${S.restSec}"></label>
        <label class="field"><span>Daily steps target</span><input type="number" inputmode="numeric" name="stepsTarget" value="${S.stepsTarget}"></label>
        <label class="field"><span>Protein target (g, blank = auto)</span><input type="number" inputmode="numeric" name="proteinTarget" value="${S.proteinTarget ?? ''}" placeholder="${P.proteinTarget({ ...S, proteinTarget: null }) ?? ''}"></label>
        <label class="field"><span>Sounds</span><select name="sound"><option value="1" ${S.sound ? 'selected' : ''}>On</option><option value="0" ${S.sound ? '' : 'selected'}>Off</option></select></label>
      </div>
      <button class="btn primary" type="submit">${icon('check')}<span>Save settings</span></button>
    </form>
    <div class="card"><h3>App lock</h3><p class="muted sm">A 4-digit PIN asked each time the app opens. It keeps casual eyes out; it is not encryption.</p>
      <div class="row wrap">${S.pinHash ? `<button class="btn" data-a="pinoff">${icon('lock')}<span>Remove PIN</span></button>` : `<input type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" id="pin" placeholder="4 digits" style="width:7em"><button class="btn" data-a="pinon">${icon('lock')}<span>Set PIN</span></button>`}</div></div>
    <div class="card"><h3>Week 2 load check</h3><p class="muted sm">${S.loadCheckDone ? 'Done.' : 'Not done yet.'}</p><button class="btn" data-a="relc">Show it again on Today</button></div>
    <div class="card warn"><h3>Erase everything</h3><p class="muted sm">Deletes all sessions, check-ins, photos and settings from this phone. Back up first.</p><button class="btn danger" data-a="wipe">${icon('trash')}<span>Erase all data</span></button></div></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      readProfile(e.target);
      const f = new FormData(e.target);
      if (f.get('abc')) S.load.abc = Number(f.get('abc'));
      if (f.get('press')) S.load.press = Number(f.get('press'));
      S.load.scheme = f.get('scheme');
      const ll = Number(f.get('loadLadder'));
      S.load.loadLadder = ll > 0; S.load.pressHeavy = ll > 0 ? ll : null;
      S.restSec = Math.max(15, Number(f.get('restSec')) || 60);
      S.stepsTarget = Number(f.get('stepsTarget')) || 10000;
      S.proteinTarget = f.get('proteinTarget') ? Number(f.get('proteinTarget')) : null;
      S.sound = f.get('sound') === '1';
      await saveSettings();
      toast('Settings saved.');
      settings();
    } catch (err) { toast(err.message); }
  };
  app.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    if (t.dataset.a === 'pinon') {
      const v = $('#pin').value;
      if (!/^\d{4}$/.test(v)) { toast('Enter exactly 4 digits.'); return; }
      S.pinHash = await sha256(`armor:${v}`); sessionStorage.setItem('unlocked', '1');
      await saveSettings(); toast('PIN set.'); settings();
    }
    if (t.dataset.a === 'pinoff') { S.pinHash = null; await saveSettings(); toast('PIN removed.'); settings(); }
    if (t.dataset.a === 'relc') { S.loadCheckDone = false; S.loadCheck = null; await saveSettings(); toast('It will show on Today from week 2.'); }
    if (t.dataset.a === 'wipe' && confirm('Erase ALL data on this phone? This cannot be undone.') && confirm('Really erase everything?')) {
      for (const st of db.STORES) await db.clear(st);
      sessionStorage.clear();
      await loadSettings();
      go('#/today');
    }
  };
}

async function privacy() {
  app.innerHTML = `<div class="page"><header class="top"><a class="btn icon-btn ghost" href="#/more" aria-label="Back">${icon('back')}</a><h1>Privacy and security</h1></header>
    <div class="card"><ul class="detail">
      <li><b>Your data stays on this phone.</b> Sessions, check-ins, measurements and photos are stored in this browser's private storage. There is no server, no account and no database anywhere else.</li>
      <li><b>The website holds no personal data.</b> It only contains the app's code. Your profile is typed in here, never stored in the code.</li>
      <li><b>Nothing is sent anywhere.</b> No analytics, trackers, ads or third-party scripts. A strict security policy blocks the app from contacting other sites.</li>
      <li><b>Ask Claude</b> only copies text to your clipboard. You decide whether to paste it.</li>
      <li><b>Backups</b> are files you save yourself. Keep them somewhere private.</li>
      <li><b>PIN lock</b> (Settings) keeps casual eyes out of the app on a shared or unlocked phone.</li>
    </ul></div>
    <p class="muted xs">Program content is paraphrased from Dan John's The Armor Building Formula and Armor Building Formula II for personal use. Buy the books at danjohnuniversity.com. This app is not medical advice; stop if anything hurts.</p></div>`;
}

// ---------- Onboarding ----------
async function onboard() {
  document.body.classList.add('in-session');
  app.innerHTML = `<div class="page"><header class="top"><div><div class="muted sm">Welcome</div><h1>Set up Armor Builder</h1></div></header>
    <p>Two minutes of setup. Everything you enter stays on this phone; nothing is uploaded.</p>
    <form id="f" class="card">${profileFields()}
      <div class="grid2"><label class="field"><span>Waist today (in)</span><input type="number" inputmode="decimal" name="waist"></label></div>
      <button class="btn huge primary" type="submit">${icon('check')}<span>Build my plan</span></button></form></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      readProfile(e.target);
      const waist = new FormData(e.target).get('waist');
      S.onboarded = true;
      await saveSettings();
      if (S.bodyweight || waist) await db.put('checkins', { date: P.iso(), weight: S.bodyweight, waist: waist ? Number(waist) : null, updated: Date.now() });
      persistStorage();
      document.body.classList.remove('in-session');
      toast('Plan built. Start with the warm-up and light bells.');
      go('#/today');
    } catch (err) { toast(err.message); }
  };
}

// ---------- PIN lock ----------
function lockView() {
  document.body.classList.add('in-session');
  let entry = '';
  const draw = () => {
    app.innerHTML = `<div class="page lock"><div class="lock-ic">${icon('lock')}</div><h1>Armor Builder</h1><p class="muted">Enter your PIN</p>
      <div class="dots">${[0, 1, 2, 3].map((i) => `<span class="${i < entry.length ? 'on' : ''}"></span>`).join('')}</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : `<button class="btn" data-k="${k}">${k}</button>`).join('')}</div></div>`;
  };
  draw();
  app.onclick = async (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    entry = k === '⌫' ? entry.slice(0, -1) : (entry + k).slice(0, 4);
    draw();
    if (entry.length === 4) {
      if ((await sha256(`armor:${entry}`)) === S.pinHash) { sessionStorage.setItem('unlocked', '1'); document.body.classList.remove('in-session'); route(); }
      else { entry = ''; toast('Wrong PIN.'); draw(); }
    }
  };
}

// ---------- boot ----------
async function boot() {
  for (const el of $$('[data-icon]')) el.innerHTML = ICONS[el.dataset.icon];
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  await loadSettings();
  window.addEventListener('hashchange', route);
  await route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
