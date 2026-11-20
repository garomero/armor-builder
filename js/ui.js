// Shared UI helpers: escaping, icons, toast, sound, wake lock, formatting, charts.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  home: P('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  book: P('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>'),
  chart: P('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
  menu: P('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'),
  play: P('<path d="M7 4l13 8-13 8z"/>'),
  pause: P('<path d="M7 4h4v16H7z"/><path d="M14 4h4v16h-4z"/>'),
  prev: P('<path d="M18 5l-9 7 9 7z"/><path d="M6 5v14"/>'),
  next: P('<path d="M6 5l9 7-9 7z"/><path d="M18 5v14"/>'),
  back: P('<path d="M15 5l-7 7 7 7"/>'),
  close: P('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
  check: P('<path d="M5 12l5 5 9-10"/>'),
  undo: P('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
  plus: P('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  minus: P('<path d="M5 12h14"/>'),
  bell: P('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  walk: P('<circle cx="13" cy="4" r="2"/><path d="M9 21l2-6 3 3v3"/><path d="M7 12l3-4 4 1 2 4 3 1"/>'),
  scale: P('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9a4 4 0 0 1 6 0l-2 3"/>'),
  download: P('<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
  upload: P('<path d="M12 20V9"/><path d="M7 14l5-5 5 5"/><path d="M5 4h14"/>'),
  calendar: P('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16"/><path d="M9 3v4"/><path d="M15 3v4"/>'),
  chat: P('<path d="M4 5h16v11H9l-5 4z"/>'),
  lock: P('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.3-2.7a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>'),
  list: P('<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>'),
  camera: P('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  trash: P('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  shield: P('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
  kb: P('<circle cx="12" cy="15" r="6"/><path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5"/>'),
};
export const icon = (name) => ICONS[name] || '';

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---- Sound + haptics ----
let audioCtx = null;
export let soundOn = true;
export function setSound(on) { soundOn = !!on; }
export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* no audio */ }
}
export function beep(freq = 880, dur = 0.15, vol = 0.35) {
  if (!soundOn || !audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur + 0.02);
  } catch { /* ignore */ }
}
export function buzz(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* ignore */ } }

// ---- Screen wake lock (keeps the phone awake mid-set) ----
let wakeWanted = false;
let wakeSentinel = null;
export async function wakeLock(on) {
  wakeWanted = on;
  try {
    if (on && 'wakeLock' in navigator && !wakeSentinel) {
      wakeSentinel = await navigator.wakeLock.request('screen');
      wakeSentinel.addEventListener('release', () => { wakeSentinel = null; });
    } else if (!on && wakeSentinel) {
      await wakeSentinel.release();
      wakeSentinel = null;
    }
  } catch { /* not supported or denied */ }
}
document.addEventListener('visibilitychange', () => {
  if (wakeWanted && document.visibilityState === 'visible') wakeLock(true);
});

// ---- Formatting ----
export const fmt = {
  mmss(sec) {
    sec = Math.max(0, Math.floor(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  },
  dateLong(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  },
  dateShort(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },
  dow(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
  },
  n(v, digits = 0) { return v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(digits); },
};
export const lbToKg = (lb) => lb * 0.45359237;

// ---- Charts (plain SVG, themed by CSS variables) ----
function scale(vals, pad = 0.1) {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [lo - p, hi + p];
}

// series: [{ points:[{label, y}], cls:'line-a'|'line-b', dots:true }]
export function lineChart(series, { height = 170, unit = '', digits = 0, zero = false, goal = null } = {}) {
  const W = 340, H = height, L = 34, R = 8, T = 10, B = 22;
  const all = series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => v != null);
  if (!all.length) return `<div class="empty-chart">No data yet</div>`;
  if (goal != null) all.push(goal);
  let [lo, hi] = scale(all);
  if (zero) lo = Math.min(0, lo);
  const n = Math.max(...series.map((s) => s.points.length));
  const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticks = [lo, (lo + hi) / 2, hi];
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  for (const t of ticks) {
    out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${L - 5}" y="${y(t) + 4}" text-anchor="end">${t.toFixed(digits)}</text>`;
  }
  if (goal != null) out += `<line class="goal" x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}"/><text class="axis goal-t" x="${W - R}" y="${y(goal) - 4}" text-anchor="end">goal ${goal}${unit}</text>`;
  const labels = series[0].points;
  if (labels.length) {
    out += `<text class="axis" x="${x(0)}" y="${H - 5}" text-anchor="start">${esc(labels[0].label)}</text>`;
    if (labels.length > 1) out += `<text class="axis" x="${x(labels.length - 1)}" y="${H - 5}" text-anchor="end">${esc(labels[labels.length - 1].label)}</text>`;
  }
  for (const s of series) {
    const pts = s.points.map((p, i) => (p.y == null ? null : [x(i), y(p.y)])).filter(Boolean);
    if (pts.length > 1) out += `<polyline class="${s.cls || 'line-a'}" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
    if (s.dots !== false) for (const p of pts) out += `<circle class="${s.cls || 'line-a'} dot" cx="${p[0]}" cy="${p[1]}" r="3"/>`;
  }
  return out + '</svg>';
}

// bars: [{label, y, hi?:bool}]
export function barChart(bars, { height = 150, goal = null, digits = 0 } = {}) {
  const W = 340, H = height, L = 34, R = 8, T = 10, B = 22;
  const vals = bars.map((b) => b.y || 0);
  if (!vals.length || vals.every((v) => !v)) return `<div class="empty-chart">No data yet</div>`;
  const hi = Math.max(...vals, goal || 0) * 1.1 || 1;
  const n = bars.length;
  const bw = ((W - L - R) / n) * 0.7;
  const x = (i) => L + ((i + 0.5) * (W - L - R)) / n;
  const y = (v) => T + (H - T - B) * (1 - v / hi);
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  for (const t of [0, hi / 2, hi]) out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${L - 5}" y="${y(t) + 4}" text-anchor="end">${t.toFixed(digits)}</text>`;
  if (goal) out += `<line class="goal" x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}"/>`;
  bars.forEach((b, i) => {
    const v = b.y || 0;
    out += `<rect class="bar${b.hi ? ' bar-hi' : ''}" x="${x(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(0, y(0) - y(v))}" rx="2"/>`;
  });
  if (n) {
    out += `<text class="axis" x="${x(0)}" y="${H - 5}" text-anchor="middle">${esc(bars[0].label)}</text>`;
    if (n > 1) out += `<text class="axis" x="${x(n - 1)}" y="${H - 5}" text-anchor="middle">${esc(bars[n - 1].label)}</text>`;
  }
  return out + '</svg>';
}

// Moving average helper for trend lines (e.g. 7-day weight).
export function movingAvg(values, win = 7) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - win + 1), i + 1).filter((v) => v != null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

export function download(filename, text, type = 'text/plain') {
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
