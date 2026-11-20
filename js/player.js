// Guided session player: warm-up → main work → carries → walk → finish.
import { db } from './db.js';
import { esc, icon, beep, buzz, wakeLock, unlockAudio, fmt, toast } from './ui.js';
import { describeBlock, bellPlan, bellText, SCHEMES, WARMUP_MOVES, MOBILITY, summarize } from './program.js';
import { openGuideSheet } from './guides.js';

const VARIATIONS = { double: ['Double press', 'double-press'], alt: ['Alternating', 'alt-press'], seesaw: ['See-saw', 'see-saw'], touchdown: ['Touchdown', 'touchdown'] };

export class Player {
  constructor(root, session, { S, onExit, onSave }) {
    this.root = root; this.s = session; this.S = S; this.onExit = onExit; this.onSave = onSave;
    this.cd = null; this.rest = null; this.lastSec = -1;
  }

  mount() {
    unlockAudio();
    wakeLock(true);
    this.render();
    this.iv = setInterval(() => this.tick(), 200);
    this.root.onclick = (e) => this.click(e);
    this.root.oninput = (e) => this.input(e);
    this.root.onchange = (e) => this.change(e);
  }
  unmount() {
    clearInterval(this.iv);
    wakeLock(false);
    this.root.onclick = this.root.oninput = this.root.onchange = null;
  }
  persist() { db.put('kv', { k: 'active', v: this.s }).catch(() => {}); }
  get b() { return this.s.blocks[this.s.cur]; }
  get bp() { return bellPlan(this.S); }

  // ---------- render ----------
  render() {
    const n = this.s.blocks.length;
    const finishing = this.s.cur >= n;
    const segs = this.s.blocks.map((_, i) => `<span class="${i < this.s.cur ? 'on' : i === this.s.cur ? 'cur' : ''}"></span>`).join('');
    let body;
    if (finishing) body = this.finishHtml();
    else {
      const b = this.b;
      const fn = { warmup: 'warmupHtml', abc: 'abcHtml', press: 'pressHtml', carry: 'carryHtml', row: 'carryHtml', walk: 'walkHtml', ruck: 'walkHtml', mobility: 'mobilityHtml' }[b.type];
      const desc = describeBlock(b, this.S);
      body = `<div class="blk-head"><h2>${esc(desc.t)}</h2>${desc.g ? `<button class="btn ghost sm" data-a="guide" data-g="${desc.g}">${icon('info')}<span>How-to</span></button>` : ''}</div>
        <p class="muted">${esc(desc.d)}</p>${this[fn](b)}`;
    }
    this.root.innerHTML = `
      <header class="ses-head">
        <button class="btn icon-btn ghost" data-a="exit" aria-label="Leave session">${icon('close')}</button>
        <div class="ses-t"><div class="ses-title">${esc(this.s.title)}</div>
        <div class="muted sm">${finishing ? 'Finish and log' : `Part ${this.s.cur + 1} of ${n}`}${this.s.week ? ` · Week ${this.s.week}` : ''}</div></div>
      </header>
      <div class="segbar">${segs}</div>
      <section class="ses-body">${body}</section>
      ${finishing ? '' : `<footer class="ses-foot">
        <button class="btn" data-a="back" ${this.s.cur === 0 ? 'aria-disabled="true"' : ''}>Back</button>
        <button class="btn primary" data-a="next">${this.s.cur === n - 1 ? 'Finish' : 'Next'} ${icon('next')}</button>
      </footer>`}`;
    this.tick(true);
  }

  // ---------- warm-up ----------
  warmupHtml(b) {
    const d = (b.done ||= { breathe: false, hang: false, hold: false, journal: {}, compass: {}, moves: {} });
    const timerRow = (key, label, secs, g) => `<div class="row">
      <label class="chk"><input type="checkbox" data-tog="${key}" ${d[key] ? 'checked' : ''}><span>${label}</span></label>
      <span class="cd" id="cd-${key}">${fmt.mmss(secs)}</span>
      <button class="btn sm" data-a="cd" data-k="${key}" data-s="${secs}">Start</button>
      ${g ? `<button class="btn ghost icon-btn sm" data-a="guide" data-g="${g}" aria-label="How-to">${icon('info')}</button>` : ''}</div>`;
    const compass = ['Work', 'Rest', 'Play', 'Pray'].map((c) => `<button class="chip ${d.compass[c] ? 'on' : ''}" data-a="compass" data-c="${c}">${c}</button>`).join('');
    const moves = WARMUP_MOVES.map((m) => `<div class="row"><label class="chk"><input type="checkbox" data-move="${m.k}" ${d.moves[m.k] ? 'checked' : ''}><span><b>${m.name}</b> · ${esc(m.text)}</span></label>
      <button class="btn ghost icon-btn sm" data-a="guide" data-g="${m.g}" aria-label="How-to">${icon('info')}</button></div>`).join('');
    return `
      <div class="card"><h3>1 · Breathe</h3><p class="muted sm">One minute. Count slow breaths; 4 to 6 is ideal.</p>${timerRow('breathe', 'One-minute breathing', 60)}</div>
      <div class="card"><h3>2 · Daily mobility</h3>${timerRow('hang', 'Bar hang (or child\'s pose)', 30, 'hang')}${timerRow('hold', 'Goblet squat hold', 30, 'goblet-hold')}</div>
      <div class="card"><h3>3 · Past · present · future</h3><p class="muted sm">Optional. Observe, don't judge.</p>
        <textarea data-in="journal.past" rows="2" placeholder="Past: how have recent sessions gone?">${esc(d.journal.past)}</textarea>
        <textarea data-in="journal.present" rows="2" placeholder="Present: what's the plan today?">${esc(d.journal.present)}</textarea>
        <textarea data-in="journal.future" rows="2" placeholder="Future: where are the next few sessions heading?">${esc(d.journal.future)}</textarea></div>
      <div class="card"><h3>4 · Life compass</h3><p class="muted sm">Tap the points that feel in balance today.</p><div class="chips">${compass}</div></div>
      <div class="card"><h3>5 · Fundamental movements</h3><p class="muted sm">One easy set each, ${esc(bellText(this.bp.warm))}. Prep, not training.</p>${moves}</div>`;
  }

  // ---------- ABC ----------
  abcHtml(b) {
    const bp = this.bp;
    const d = (b.done ||= {});
    d.rounds ??= 0; d.mode ??= 'emom'; d.times ??= []; d.pausedMs ??= 0;
    d.bells ??= bp.abc != null ? [bp.abc, bp.abc] : [bp.single, null];
    const started = !!d.startAt;
    const pct = Math.min(100, (d.rounds / b.target) * 100);
    const opts = this.bellOptions(d.bells);
    return `
      ${b.why ? `<p class="coach">${icon('chat')}<span>${esc(b.why)}</span></p>` : ''}
      <div class="row wrap">
        <label class="sel">Bells <select data-ch="abcBells">${opts}</select></label>
        <div class="seg" role="group" aria-label="Pacing">
          <button class="${d.mode === 'emom' ? 'on' : ''}" data-a="mode" data-m="emom">Every minute</button>
          <button class="${d.mode === 'own' ? 'on' : ''}" data-a="mode" data-m="own">Own pace</button>
        </div>
      </div>
      <div class="bigclock"><div class="clock" id="abc-clock">0:00</div><div class="muted" id="abc-next">${d.mode === 'emom' ? 'One round at the top of each minute' : 'Rest as needed between rounds'}</div></div>
      <div class="count"><span id="abc-rounds">${d.rounds}</span><span class="of">/ ${b.target} rounds</span></div>
      <div class="pbar"><span style="width:${pct}%"></span></div>
      <p class="muted sm center">${d.rounds * 2} cleans · ${d.rounds} presses · ${d.rounds * 3} squats</p>
      ${started
        ? `<button class="btn huge primary" data-a="round">${icon('check')} Round done</button>
           <div class="row center"><button class="btn" data-a="undoRound">${icon('undo')}<span>Undo</span></button>
           <button class="btn" data-a="pause">${icon(d.pauseAt ? 'play' : 'pause')}<span>${d.pauseAt ? 'Resume' : 'Pause'}</span></button></div>`
        : `<button class="btn huge primary" data-a="startAbc">${icon('play')} Start clock</button>
           <p class="muted sm center">Tip: start the clock, then do round 1 right away.</p>`}`;
  }
  bellOptions(cur) {
    const { uniq, pairs } = this.bp;
    const list = [];
    for (const p of pairs) list.push([p, p]);
    for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) list.push([uniq[i], uniq[j]]);
    if (!list.length && uniq.length) list.push([uniq[0], null]);
    return list.map(([a, c]) => {
      const v = `${a}|${c ?? ''}`;
      const label = c == null ? `${a} lb (single)` : a === c ? `2 × ${a} lb` : `${a} + ${c} lb (uneven, swap each round)`;
      return `<option value="${v}" ${cur && cur[0] === a && (cur[1] ?? null) === c ? 'selected' : ''}>${label}</option>`;
    }).join('');
  }
  abcElapsed(d) {
    if (!d.startAt) return 0;
    const end = d.pauseAt || Date.now();
    return Math.max(0, (end - d.startAt - (d.pausedMs || 0)) / 1000);
  }

  // ---------- press ----------
  pressHtml(b) {
    const bp = this.bp;
    const d = (b.done ||= {});
    d.scheme ??= b.scheme; d.sets ??= []; d.variation ??= 'double'; d.adj ??= 0; d.ladders ??= b.ladders;
    const rungs = SCHEMES[d.scheme];
    const L = Math.floor(d.sets.length / rungs.length), R = d.sets.length % rungs.length;
    const total = d.sets.reduce((a, x) => a + x.reps, 0);
    const goal = rungs.reduce((a, x) => a + x, 0) * d.ladders;
    const bellFor = (r) => (bp.pressHeavy && rungs[r] <= 3 ? bp.pressHeavy : bp.press);
    let grid = '';
    const rows = Math.max(d.ladders, L + (R ? 1 : 0));
    for (let l = 0; l < rows; l++) {
      grid += `<div class="ladder"><span class="lad-l">L${l + 1}</span>`;
      rungs.forEach((reps, r) => {
        const idx = l * rungs.length + r;
        const set = d.sets[idx];
        const cls = set ? 'done' : idx === d.sets.length ? 'cur' : '';
        grid += `<span class="rung ${cls}">${set ? set.reps : reps}</span>`;
      });
      grid += '</div>';
    }
    const done = L >= d.ladders && R === 0;
    const repsNow = rungs[R] + d.adj;
    const vars = Object.entries(VARIATIONS).map(([k, [name]]) => `<option value="${k}" ${d.variation === k ? 'selected' : ''}>${name}</option>`).join('');
    const schemes = Object.keys(SCHEMES).map((k) => `<option ${d.scheme === k ? 'selected' : ''}>${k}</option>`).join('');
    const resting = this.rest && this.rest.end > Date.now();
    return `
      ${b.why ? `<p class="coach">${icon('chat')}<span>${esc(b.why)}</span></p>` : ''}
      <div class="row wrap">
        <label class="sel">Ladder <select data-ch="scheme" ${d.sets.length ? 'disabled' : ''}>${schemes}</select></label>
        <label class="sel">Style <select data-ch="variation">${vars}</select></label>
        <button class="btn ghost sm" data-a="guide" data-g="${VARIATIONS[d.variation][1]}">${icon('info')}<span>Style how-to</span></button>
      </div>
      <div class="ladders">${grid}</div>
      <div class="count"><span>${total}</span><span class="of">/ ${goal} reps</span></div>
      ${resting
        ? `<div class="bigclock rest"><div class="muted">Rest</div><div class="clock" id="rest-clock">0:00</div>
           <button class="btn" data-a="skipRest">Skip rest</button></div>`
        : done
          ? `<div class="card ok"><p><b>Target reached: ${total} reps.</b> Add a ladder only if every rep stayed crisp (up to ${b.max}).</p>
             <div class="row"><button class="btn" data-a="addLadder">${icon('plus')}<span>Add a ladder</span></button></div></div>`
          : `<div class="card now">
              <div class="muted sm">Ladder ${L + 1} · rung ${R + 1} of ${rungs.length}</div>
              <div class="now-line"><button class="btn icon-btn" data-a="adj" data-d="-1" aria-label="One fewer rep">${icon('minus')}</button>
              <span class="now-reps">${repsNow} reps</span>
              <button class="btn icon-btn" data-a="adj" data-d="1" aria-label="One more rep">${icon('plus')}</button></div>
              <div class="muted sm center">${esc(bellText(bellFor(R), true))}${R === rungs.length - 1 ? ' · longer rest after this one' : ''}</div>
            </div>
            <button class="btn huge primary" data-a="pressDone">${icon('check')} Done: ${repsNow}</button>`}
      <div class="row center"><button class="btn" data-a="undoSet" ${d.sets.length ? '' : 'aria-disabled="true"'}>${icon('undo')}<span>Undo last set</span></button></div>
      <p class="muted sm center">Put the bells down between mini-sets. Rest timer: ${this.S.restSec}s (double after each ladder).</p>`;
  }

  // ---------- carries / rows ----------
  carryHtml(b) {
    const d = (b.done ||= { sets: 0 });
    const target = b.sets;
    const each = b.type === 'row' ? `${b.reps} reps each arm` : b.kind === 'suitcase' ? 'one trip = down with one hand, back with the other' : b.dist;
    return `
      ${b.optional ? '<p class="muted sm">Optional. Skip it if recovery is suffering.</p>' : ''}
      <div class="count"><span>${d.sets}</span><span class="of">/ ${target} ${b.type === 'row' ? 'sets' : 'trips'}</span></div>
      <p class="muted center">${esc(each)}</p>
      <button class="btn huge primary" data-a="setDone">${icon('check')} ${b.type === 'row' ? 'Set' : 'Trip'} done</button>
      <div class="row center"><button class="btn" data-a="setUndo">${icon('undo')}<span>Undo</span></button></div>
      <p class="muted sm center">${b.type === 'row' ? 'Flat back, elbow to the back pocket.' : 'Stay tall. Breathe. Set the bells down with a hinge.'}</p>`;
  }

  // ---------- walk / ruck ----------
  walkHtml(b) {
    const d = (b.done ||= {});
    const running = d.startAt && !d.stopAt;
    return `
      <div class="bigclock"><div class="clock" id="walk-clock">${fmt.mmss((d.minutes || 0) * 60)}</div>
      <div class="muted">Target ${b.min}–${b.max} min</div></div>
      ${running
        ? `<button class="btn huge primary" data-a="walkStop">${icon('check')} Finish walk</button>`
        : `<button class="btn huge primary" data-a="walkStart">${icon('play')} ${d.minutes ? 'Restart' : 'Start'} walk timer</button>`}
      <div class="row center wrap">
        <label class="sel">Or enter minutes <input type="number" inputmode="numeric" min="0" max="300" data-in="minutes" value="${d.minutes ?? ''}" style="width:5.5em"></label>
        ${b.type === 'ruck' ? `<label class="sel">Pack (lb) <input type="number" inputmode="numeric" min="0" max="80" data-in="pack" value="${d.pack ?? ''}" style="width:5em"></label>` : ''}
      </div>
      <p class="muted sm center">${b.type === 'walk' && this.s.kind === 'lift' ? 'Leave the phone on this screen or lock it; the timer keeps time either way.' : 'Easy pace. Enjoy the air.'}</p>`;
  }

  mobilityHtml(b) {
    const d = (b.done ||= { items: [] });
    return `<div class="card">${MOBILITY.map((m, i) => `<label class="chk row"><input type="checkbox" data-mob="${i}" ${d.items.includes(i) ? 'checked' : ''}><span>${esc(m)}</span></label>`).join('')}</div>`;
  }

  // ---------- finish ----------
  finishHtml() {
    const sum = summarize(this.s);
    const parts = [];
    if (sum.abc) parts.push(`<div class="stat"><b>${sum.abc}</b><span>ABC rounds</span></div>`);
    if (sum.presses) parts.push(`<div class="stat"><b>${sum.presses}</b><span>presses</span></div>`);
    if (sum.squats) parts.push(`<div class="stat"><b>${sum.squats}</b><span>squats</span></div>`);
    if (sum.carrySets) parts.push(`<div class="stat"><b>${sum.carrySets}</b><span>carry/row sets</span></div>`);
    if (sum.walkMin) parts.push(`<div class="stat"><b>${sum.walkMin}</b><span>walk min</span></div>`);
    const rpe = (k, label) => `<button class="chip big ${this.s.rpe === k ? 'on' : ''}" data-a="rpe" data-v="${k}">${label}</button>`;
    return `
      <h2>Nice work.</h2>
      <div class="stats">${parts.join('') || '<p class="muted">Nothing logged yet. Go back and log your work, or save anyway.</p>'}</div>
      <div class="card"><h3>How did it feel?</h3><div class="chips">${rpe('easy', 'Easy')}${rpe('right', 'Just right')}${rpe('grind', 'A grind')}</div>
      <h3>Were all reps crisp?</h3><div class="chips">
        <button class="chip big ${this.s.crisp === true ? 'on' : ''}" data-a="crisp" data-v="1">Yes</button>
        <button class="chip big ${this.s.crisp === false ? 'on' : ''}" data-a="crisp" data-v="0">Some got sloppy</button></div>
      <h3>Notes</h3><textarea data-in="notes" rows="3" placeholder="Anything worth remembering: bells, soreness, sleep, wins">${esc(this.s.notes)}</textarea></div>
      <button class="btn huge primary" data-a="save">${icon('check')} Save session</button>
      <div class="row center"><button class="btn" data-a="back">Back</button><button class="btn danger" data-a="discard">${icon('trash')}<span>Discard</span></button></div>`;
  }

  // ---------- timers ----------
  tick(force = false) {
    const now = Date.now();
    if (this.cd) {
      const left = (this.cd.end - now) / 1000;
      const el = document.getElementById(`cd-${this.cd.key}`);
      if (el) el.textContent = fmt.mmss(Math.ceil(left));
      if (left <= 0) {
        const b = this.b;
        if (b && b.type === 'warmup') b.done[this.cd.key] = true;
        this.cd = null; beep(1320, 0.3); buzz([150, 80, 150]);
        this.persist(); this.render(); return;
      }
    }
    if (this.rest) {
      const left = (this.rest.end - now) / 1000;
      const el = document.getElementById('rest-clock');
      if (el) el.textContent = fmt.mmss(Math.ceil(left));
      if (left <= 3 && left > 0 && Math.ceil(left) !== this.rest.lastBeep) { this.rest.lastBeep = Math.ceil(left); beep(660, 0.08); }
      if (left <= 0) { this.rest = null; beep(1100, 0.25); buzz(200); this.render(); return; }
    }
    const b = this.b;
    if (!b) return;
    if (b.type === 'abc' && b.done?.startAt) {
      const d = b.done;
      const el = this.abcElapsed(d);
      const c = document.getElementById('abc-clock');
      if (c) c.textContent = fmt.mmss(el);
      const sec = Math.floor(el);
      if (d.mode === 'emom' && !d.pauseAt) {
        const nx = document.getElementById('abc-next');
        const left = 60 - (sec % 60);
        if (nx) nx.textContent = `Next round in ${left === 60 ? '0:00' : fmt.mmss(left)} · minute ${Math.floor(sec / 60) + 1}`;
        if (sec !== this.lastSec && !force) {
          const s60 = sec % 60;
          if (s60 >= 57) beep(660, 0.09);
          if (s60 === 0 && sec > 0) { beep(1100, 0.35); buzz(250); }
        }
      }
      this.lastSec = sec;
    }
    if ((b.type === 'walk' || b.type === 'ruck') && b.done?.startAt && !b.done.stopAt) {
      const c = document.getElementById('walk-clock');
      if (c) c.textContent = fmt.mmss((now - b.done.startAt) / 1000);
    }
  }

  // ---------- events ----------
  click(e) {
    const t = e.target.closest('[data-a]');
    if (!t || t.getAttribute('aria-disabled') === 'true') return;
    unlockAudio();
    const a = t.dataset.a;
    const b = this.b;
    const d = b?.done;
    switch (a) {
      case 'exit': return this.exit();
      case 'guide': return openGuideSheet(t.dataset.g, this.S);
      case 'next': return this.go(1);
      case 'back': return this.go(-1);
      case 'cd': this.cd = { key: t.dataset.k, end: Date.now() + Number(t.dataset.s) * 1000 }; beep(880, 0.1); return;
      case 'compass': d.compass[t.dataset.c] = !d.compass[t.dataset.c]; break;
      case 'mode': d.mode = t.dataset.m; break;
      case 'startAbc': d.startAt = Date.now(); d.pausedMs = 0; d.pauseAt = null; this.lastSec = 0; beep(1100, 0.3); buzz(150); break;
      case 'round': {
        d.rounds += 1; d.times.push(Math.round(this.abcElapsed(d)));
        beep(1500, 0.07); buzz(40);
        if (d.rounds === b.target) toast('Target hit. Keep going only if every rep stays crisp.', 3500);
        break;
      }
      case 'undoRound': if (d.rounds > 0) { d.rounds -= 1; d.times.pop(); } break;
      case 'pause':
        if (d.pauseAt) { d.pausedMs += Date.now() - d.pauseAt; d.pauseAt = null; } else d.pauseAt = Date.now();
        break;
      case 'adj': d.adj = Math.max(1 - SCHEMES[d.scheme][d.sets.length % SCHEMES[d.scheme].length], d.adj + Number(t.dataset.d)); break;
      case 'pressDone': {
        const rungs = SCHEMES[d.scheme];
        const R = d.sets.length % rungs.length;
        const bp = this.bp;
        const bell = bp.pressHeavy && rungs[R] <= 3 ? bp.pressHeavy : bp.press;
        d.sets.push({ reps: rungs[R] + d.adj, bell, ladder: Math.floor(d.sets.length / rungs.length) + 1, rung: R, t: Date.now() });
        d.adj = 0;
        const secs = R === rungs.length - 1 ? this.S.restSec * 2 : this.S.restSec;
        this.rest = { end: Date.now() + secs * 1000 };
        beep(1500, 0.07); buzz(40);
        break;
      }
      case 'skipRest': this.rest = null; break;
      case 'undoSet': d.sets.pop(); this.rest = null; break;
      case 'addLadder': d.ladders += 1; break;
      case 'setDone': d.sets += 1; beep(1500, 0.07); buzz(40); if (d.sets === b.sets) toast('All sets done.'); break;
      case 'setUndo': d.sets = Math.max(0, d.sets - 1); break;
      case 'walkStart': d.startAt = Date.now(); d.stopAt = null; break;
      case 'walkStop': d.stopAt = Date.now(); d.minutes = Math.max(1, Math.round((d.stopAt - d.startAt) / 60000)); beep(1100, 0.2); break;
      case 'rpe': this.s.rpe = t.dataset.v; break;
      case 'crisp': this.s.crisp = t.dataset.v === '1'; break;
      case 'save': return this.save();
      case 'discard': return this.discard();
      default: return;
    }
    this.persist();
    this.render();
  }

  input(e) {
    const k = e.target.dataset.in;
    if (!k) return;
    const v = e.target.value;
    if (k === 'notes') this.s.notes = v;
    else if (k.startsWith('journal.')) this.b.done.journal[k.split('.')[1]] = v;
    else if (k === 'minutes') this.b.done.minutes = v === '' ? null : Math.max(0, Number(v));
    else if (k === 'pack') this.b.done.pack = v === '' ? null : Number(v);
    this.persist();
  }

  change(e) {
    const t = e.target;
    const d = this.b?.done;
    if (t.dataset.tog) { d[t.dataset.tog] = t.checked; }
    else if (t.dataset.move) { d.moves[t.dataset.move] = t.checked; }
    else if (t.dataset.mob) {
      const i = Number(t.dataset.mob);
      d.items = t.checked ? [...new Set([...d.items, i])] : d.items.filter((x) => x !== i);
    } else if (t.dataset.ch === 'abcBells') {
      const [a, c] = t.value.split('|');
      d.bells = [Number(a), c ? Number(c) : null];
    } else if (t.dataset.ch === 'scheme') { d.scheme = t.value; d.adj = 0; this.render(); }
    else if (t.dataset.ch === 'variation') { d.variation = t.value; this.render(); }
    else return;
    this.persist();
  }

  go(dir) {
    const b = this.b;
    if (b?.type === 'abc' && b.done?.startAt) b.done.seconds = Math.round(this.abcElapsed(b.done));
    if ((b?.type === 'walk' || b?.type === 'ruck') && b.done?.startAt && !b.done.stopAt) {
      b.done.stopAt = Date.now();
      b.done.minutes = Math.max(1, Math.round((b.done.stopAt - b.done.startAt) / 60000));
    }
    this.cd = null; this.rest = null;
    this.s.cur = Math.max(0, Math.min(this.s.blocks.length, this.s.cur + dir));
    this.persist();
    this.render();
    this.root.scrollTo?.(0, 0); window.scrollTo(0, 0);
  }

  exit() {
    if (confirm('Leave this session? Your progress is kept and you can resume it from Today.')) {
      this.persist();
      this.unmount();
      this.onExit();
    }
  }

  async discard() {
    if (!confirm('Discard this session? Nothing from it will be saved.')) return;
    await db.del('kv', 'active');
    this.unmount();
    this.onExit();
  }

  async save() {
    if (!this.s.rpe) { toast('Pick how it felt first. It drives next session\'s targets.'); return; }
    for (const b of this.s.blocks) if (b.type === 'abc' && b.done?.startAt && !b.done.seconds) b.done.seconds = Math.round(this.abcElapsed(b.done));
    this.s.status = 'done';
    this.s.endedAt = Date.now();
    delete this.s.cur;
    await db.put('sessions', this.s);
    await db.del('kv', 'active');
    this.unmount();
    this.onSave(this.s);
  }
}
