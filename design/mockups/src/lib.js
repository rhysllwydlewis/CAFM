// HTML/SVG builders for the mockups. Every screen in screens/*.js is composed
// from these, so the visual language stays consistent across ~90 views.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logomark } from '../../tools/custom-icons.js';
import { wordmark } from '../../tools/logo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const iconCache = {};
export function I(name, cls = '') {
  if (!iconCache[name]) {
    const f = path.join(root, 'icons/svg', `${name}.svg`);
    if (!fs.existsSync(f)) throw new Error(`unknown icon "${name}"`);
    iconCache[name] = fs.readFileSync(f, 'utf8').trim();
  }
  return iconCache[name].replace('<svg ', `<svg class="i ${cls}" `);
}
export const logo = (size = 28, opts) => logomark(size, opts);
export const join = (a) => (Array.isArray(a) ? a.join('') : a ?? '');
export const esc = (s) => String(s);

// ── Primitives ─────────────────────────────────────────────
export const btn = (label, { v = 'secondary', icon, end, sm, lg, block, iconOnly } = {}) =>
  `<span class="btn ${v} ${sm ? 'sm' : ''} ${lg ? 'lg' : ''} ${block ? 'block' : ''} ${iconOnly ? 'icon' : ''}">${icon ? I(icon) : ''}${label ? `<span>${label}</span>` : ''}${end ? I(end) : ''}</span>`;
export const ibtn = (icon, v = 'ghost', sm = true) => `<span class="btn ${v} icon ${sm ? 'sm' : ''}">${I(icon)}</span>`;
export const badge = (text, tone = '', { dot, sm, icon } = {}) =>
  `<span class="badge ${tone} ${sm ? 'sm' : ''}">${dot ? '<span class="d"></span>' : ''}${icon ? I(icon, 's14') : ''}${text}</span>`;
export const dot = (tone) => `<span class="dot ${tone}"></span>`;
export const tag = (t) => `<span class="tag">${t}</span>`;
export const chip = (label, value, on) => `<span class="chip ${on ? 'on' : ''}">${on ? '' : I('add', 's14')}${label}${value ? `: <b>${value}</b>` : ''}${on ? I('chevron-down', 's14') : ''}</span>`;
export const prio = (p) => {
  const names = { 1: 'P1 Emergency', 2: 'P2 Urgent', 3: 'P3 Routine', 4: 'P4 Planned' };
  return `<span class="prio p${p}"><span class="bars"><i></i><i></i><i></i></span>${names[p]}</span>`;
};
export const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const av = (name, { s = '', g, co } = {}) => `<span class="av ${s} ${g ? 'g' : ''} ${co ? 'co' : ''}">${initials(name)}</span>`;
export const avs = (names, s = 's24') => `<span class="avs">${names.map((n, i) => av(n, { s, g: i % 2 === 1 })).join('')}</span>`;
export const who = (name, sub, opts = {}) => `<span class="row" style="gap:10px">${av(name, opts)}<span class="cell2" style="display:flex;flex-direction:column;line-height:17px"><span class="medium">${name}</span>${sub ? `<small class="faint xs">${sub}</small>` : ''}</span></span>`;
export const cell2 = (a, b) => `<span class="cell2"><span>${a}</span><small>${b}</small></span>`;
export const ref = (r) => `<span class="mono">${r}</span>`;
export const bar = (pct, tone = '', thin) => `<div class="bar ${tone} ${thin ? 'thin' : ''}"><i style="width:${pct}%"></i></div>`;
export const cb = (on) => `<span class="cb ${on ? 'on' : ''}"></span>`;
export const sw = (on) => `<span class="switch ${on ? 'on' : ''}"></span>`;
export const kbd = (k) => `<span class="kbd">${k}</span>`;

export const status = (s) => {
  const map = {
    'Logged': ['', true], 'New': ['primary', true], 'Assigned': ['primary', true], 'Accepted': ['primary', true],
    'Travelling': ['primary', true], 'On site': ['primary', true], 'In progress': ['primary', true], 'Awaiting parts': ['warning', true],
    'On hold': ['warning', true], 'Awaiting quote': ['warning', true], 'Awaiting approval': ['warning', true], 'Paused': ['warning', true],
    'Completed': ['success', true], 'Verified': ['success', true], 'Closed': ['', true], 'Cancelled': ['', true], 'Approved': ['success', true],
    'Overdue': ['danger', true], 'Breached': ['danger', true], 'Rejected': ['danger', true], 'Expired': ['danger', true], 'Due soon': ['warning', true],
    'Compliant': ['success', true], 'Active': ['success', true], 'Draft': ['', true], 'Scheduled': ['primary', true], 'Open': ['primary', true],
    'Suspended': ['danger', true], 'Pending': ['warning', true], 'Paid': ['success', true], 'Sent': ['primary', true], 'Received': ['success', true],
    'Booked': ['primary', true], 'Checked in': ['success', true], 'Expected': ['', true], 'Signed out': ['', true], 'Online': ['success', true],
    'Offline': ['danger', true], 'Alarm': ['danger', true], 'Low stock': ['warning', true], 'In stock': ['success', true], 'Out of stock': ['danger', true],
    'Live': ['success', true], 'Issued': ['primary', true], 'Returned': ['', true], 'At risk': ['warning', true], 'On track': ['success', true],
  };
  const [tone, d] = map[s] || ['', true];
  return badge(s, tone, { dot: d });
};
export const sla = (text, tone) => `<span class="row g1 sm ${tone ? `${tone}-t` : ''}" style="color:var(--${tone ? tone + '-text' : 'text-muted'})">${I('sla', 's14')}<span class="medium num">${text}</span></span>`;

// ── Layout ─────────────────────────────────────────────────
export const card = (title, body, { acts = '', sub = '', flush, foot, cls = '', style = '', flat } = {}) =>
  `<div class="card ${cls}" style="${style}">${title ? `<div class="card-h ${flat ? 'flat' : ''}"><div class="col" style="gap:2px"><span class="card-t">${title}</span>${sub ? `<span class="card-s">${sub}</span>` : ''}</div><div class="acts">${acts}</div></div>` : ''}<div class="card-b ${flush ? 'flush' : ''}">${join(body)}</div>${foot ? `<div class="card-f">${foot}</div>` : ''}</div>`;
export const kpi = (label, value, { delta, dir = 'up', sub = '', icon, spark: sp, unit = '' } = {}) =>
  `<div class="card"><div class="kpi"><span class="kpi-l">${icon ? I(icon, 's14') : ''}${label}</span><span class="kpi-v num">${value}${unit ? `<small>${unit}</small>` : ''}</span><span class="kpi-d">${delta ? `<span class="delta ${dir}">${I(dir === 'down' ? 'trend-down' : dir === 'flat' ? 'sort' : 'trend-up', 's14')}${delta}</span>` : ''}${sub}</span>${sp || ''}</div></div>`;
export const tabs = (items, on = 0) => `<div class="tabs">${items.map((t, i) => { const [label, n] = Array.isArray(t) ? t : [t]; return `<span class="${i === on ? 'on' : ''}">${label}${n !== undefined ? `<span class="n">${n}</span>` : ''}</span>`; }).join('')}</div>`;
export const seg = (items, on = 0) => `<span class="seg">${items.map((t, i) => { const [label, icon] = Array.isArray(t) ? t : [t]; return `<span class="${i === on ? 'on' : ''}">${icon ? I(icon, 's14') : ''}${label}</span>`; }).join('')}</span>`;
export const search = (ph = 'Search', w = 260) => `<span class="search" style="min-width:${w}px">${I('search', 's14')}${ph}</span>`;
export const toolbar = (left, right = '') => `<div class="toolbar">${join(left)}<span class="grow"></span>${join(right)}</div>`;
export const kv = (pairs, w = 140) => `<dl class="kv" style="grid-template-columns:${w}px minmax(0,1fr)">${pairs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
export const field = (label, control, { hint, req } = {}) => `<div class="field"><span class="label">${label}${req ? '<span class="req">*</span>' : ''}</span>${control}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
export const input = (v, { ph, icon, end, focus, lg } = {}) => `<div class="input ${ph ? 'ph' : ''} ${focus ? 'focus' : ''} ${lg ? 'lg' : ''}">${icon ? I(icon, 's14') : ''}<span class="grow" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${v || ph || ''}</span>${end ? `<span class="end">${end}</span>` : ''}</div>`;
export const select = (v, opts = {}) => input(v, { ...opts, end: I('chevron-down', 's14') });
export const textarea = (v, h = 84) => `<div class="textarea" style="min-height:${h}px">${v}</div>`;
export const callout = (body, { tone = '', icon = 'info' } = {}) => `<div class="callout ${tone}">${I(icon)}<div class="grow">${body}</div></div>`;
export const li = (icon, title, sub, end = '', tone = '') => `<div class="li"><span class="ic ${tone}">${I(icon)}</span><div class="grow col" style="gap:1px"><span class="medium">${title}</span>${sub ? `<span class="xs faint">${sub}</span>` : ''}</div>${end}</div>`;
export const tl = (items) => `<div class="tl">${items.map(([icon, body, when, note, tone]) => `<div class="tl-i"><span class="tl-dot ${tone ? `ic ${tone}` : ''}">${I(icon)}</span><div class="tl-b"><div>${body}</div><div class="when">${when}</div>${note ? `<div class="note ${note.internal ? 'internal' : ''}">${note.text || note}</div>` : ''}</div></div>`).join('')}</div>`;
export const photo = (w, h, v = '') => `<div class="photo ${v}" style="width:${w}px;height:${h}px"></div>`;
export const stepper = (steps, cur) => `<div class="stepper">${steps.map((s, i) => `${i ? '<span class="ln"></span>' : ''}<span class="st ${i < cur ? 'done' : i === cur ? 'cur' : ''}"><span class="n">${i < cur ? '✓' : i + 1}</span>${s}</span>`).join('')}</div>`;

export function table(cols, rows, { dense, sel = [], hover = -1, foot, check } = {}) {
  const th = cols.map((c) => { const [h, o = {}] = Array.isArray(c) ? c : [c]; return `<th class="${o.num ? 'num' : ''}" style="${o.w ? `width:${o.w}px` : ''}">${h}</th>`; }).join('');
  const body = rows.map((r, i) => `<tr class="${sel.includes(i) ? 'sel' : ''} ${hover === i ? 'hover' : ''}">${check ? `<td style="width:36px;padding-right:0">${cb(sel.includes(i))}</td>` : ''}${r.map((c, j) => { const o = (Array.isArray(cols[j]) ? cols[j][1] : {}) || {}; return `<td class="${o.num ? 'num' : ''}">${c}</td>`; }).join('')}</tr>`).join('');
  return `<table class="tbl ${dense ? 'dense' : ''}"><thead><tr>${check ? `<th style="width:36px;padding-right:0">${cb(false)}</th>` : ''}${th}</tr></thead><tbody>${body}</tbody></table>${foot ? `<div class="tbl-foot">${foot}</div>` : ''}`;
}

// ── Charts (SVG) ───────────────────────────────────────────
const C = { p: 'var(--chart-1)', p2: 'var(--chart-2)', g: 'var(--chart-3)', g2: 'var(--chart-4)', grid: 'var(--chart-grid)', s: 'var(--success)', w: 'var(--warning)', d: 'var(--danger)' };
const col = (c) => C[c] || c;
// Round an axis maximum up so the four gridline steps are 1, 2, 2.5 or 5 × 10^n.
const niceMax = (v) => { const raw = v / 4; const p = 10 ** Math.floor(Math.log10(raw || 1)); const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw); return step * 4; };
export function barChart({ labels, series, h = 200, w = 560, max, stacked, yfmt = (v) => v, gap = 0.36, target }) {
  const pl = 34, pb = 24, pt = 8, iw = w - pl - 6, ih = h - pb - pt;
  const totals = labels.map((_, i) => (stacked ? series.reduce((s, se) => s + se.values[i], 0) : Math.max(...series.map((se) => se.values[i]))));
  const M = max || niceMax(Math.max(...totals) * 1.08) || 1;
  const bw = iw / labels.length; const inner = bw * (1 - gap);
  let out = '';
  for (let k = 0; k <= 4; k++) { const y = pt + ih - (ih * k) / 4; out += `<line x1="${pl}" x2="${w - 6}" y1="${y}" y2="${y}" stroke="${C.grid}"/><text x="${pl - 8}" y="${y + 4}" font-size="10.5" fill="var(--text-faint)" text-anchor="end">${yfmt(Math.round((M * k) / 4))}</text>`; }
  labels.forEach((l, i) => {
    const x0 = pl + i * bw + (bw - inner) / 2;
    if (stacked) { let acc = 0; series.forEach((se, si) => { const v = se.values[i]; const bh = (ih * v) / M; const y = pt + ih - ((acc + v) * ih) / M; out += `<rect x="${x0}" y="${y}" width="${inner}" height="${Math.max(bh, 0)}" fill="${col(se.c)}" ${si === series.length - 1 ? 'rx="3"' : ''}/>`; acc += v; }); }
    else { const sw = inner / series.length; series.forEach((se, si) => { const v = se.values[i]; const bh = (ih * v) / M; out += `<rect x="${x0 + si * sw}" y="${pt + ih - bh}" width="${sw - (series.length > 1 ? 2 : 0)}" height="${bh}" rx="3" fill="${col(se.c)}"/>`; }); }
    out += `<text x="${pl + i * bw + bw / 2}" y="${h - 6}" font-size="10.5" fill="var(--text-faint)" text-anchor="middle">${l}</text>`;
  });
  if (target !== undefined) { const y = pt + ih - (ih * target) / M; out += `<line x1="${pl}" x2="${w - 6}" y1="${y}" y2="${y}" stroke="var(--text-muted)" stroke-dasharray="4 4"/>`; }
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" style="display:block">${out}</svg>`;
}
export function lineChart({ labels, series, h = 200, w = 560, min = 0, max, yfmt = (v) => Math.round(v), target }) {
  const pl = 38, pb = 24, pt = 10, iw = w - pl - 8, ih = h - pb - pt;
  const all = series.flatMap((s) => s.values.filter((v) => v !== null));
  const M = max || (min === 0 ? niceMax(Math.max(...all) * 1.05) : Math.ceil(Math.max(...all) * 1.1));
  const X = (i) => pl + (iw * i) / (labels.length - 1); const Y = (v) => pt + ih - (ih * (v - min)) / (M - min);
  let out = '';
  for (let k = 0; k <= 4; k++) { const v = min + ((M - min) * k) / 4; const y = Y(v); out += `<line x1="${pl}" x2="${w - 8}" y1="${y}" y2="${y}" stroke="${C.grid}"/><text x="${pl - 8}" y="${y + 4}" font-size="10.5" fill="var(--text-faint)" text-anchor="end">${yfmt(v)}</text>`; }
  labels.forEach((l, i) => { if (labels.length <= 14 || i % 2 === 0) out += `<text x="${X(i)}" y="${h - 6}" font-size="10.5" fill="var(--text-faint)" text-anchor="middle">${l}</text>`; });
  if (target !== undefined) out += `<line x1="${pl}" x2="${w - 8}" y1="${Y(target)}" y2="${Y(target)}" stroke="var(--text-muted)" stroke-dasharray="4 4"/>`;
  series.forEach((s) => {
    const pts = s.values.map((v, i) => (v === null ? null : [X(i), Y(v)])).filter(Boolean);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    if (s.area) out += `<path d="${d} L${pts[pts.length - 1][0]} ${pt + ih} L${pts[0][0]} ${pt + ih}Z" fill="${col(s.c)}" opacity="0.10"/>`;
    out += `<path d="${d}" fill="none" stroke="${col(s.c)}" stroke-width="${s.w || 2}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.end) { const p = pts[pts.length - 1]; out += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--bg-surface)" stroke="${col(s.c)}" stroke-width="2"/>`; }
  });
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" style="display:block">${out}</svg>`;
}
export function donut({ segs, size = 140, thick = 16, label = '', sub = '' }) {
  const r = (size - thick) / 2, c = size / 2, circ = 2 * Math.PI * r; const tot = segs.reduce((s, x) => s + x.v, 0); let off = 0; let out = '';
  out += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--bg-muted)" stroke-width="${thick}"/>`;
  segs.forEach((s) => { const len = (circ * s.v) / tot; out += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${col(s.c)}" stroke-width="${thick}" stroke-dasharray="${Math.max(len - 2, 0)} ${circ}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})"/>`; off += len; });
  out += `<text x="${c}" y="${c + (sub ? 2 : 7)}" text-anchor="middle" font-size="${size / 6.2}" font-weight="600" fill="var(--text)" font-family="var(--font-display)">${label}</text>`;
  if (sub) out += `<text x="${c}" y="${c + 18}" text-anchor="middle" font-size="11" fill="var(--text-faint)">${sub}</text>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${out}</svg>`;
}
export function spark(values, { w = 120, h = 32, c = 'p', area = true } = {}) {
  const mn = Math.min(...values), mx = Math.max(...values); const X = (i) => (w * i) / (values.length - 1); const Y = (v) => h - 3 - ((h - 6) * (v - mn)) / (mx - mn || 1);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;max-width:${w}px">${area ? `<path d="${d} L${w} ${h} L0 ${h}Z" fill="${col(c)}" opacity="0.1"/>` : ''}<path d="${d}" fill="none" stroke="${col(c)}" stroke-width="1.75" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
export const legend = (items) => `<div class="legend">${items.map(([l, c]) => `<span><i style="background:${col(c)}"></i>${l}</span>`).join('')}</div>`;
export const hbars = (rows, { tone = '' } = {}) => `<div class="stack g3">${rows.map(([l, v, pct, t]) => `<div class="col" style="gap:5px"><div class="row between sm"><span>${l}</span><span class="medium num">${v}</span></div>${bar(pct, t || tone)}</div>`).join('')}</div>`;

// ── Map (stylised street map, no real geography) ────────────
export function mapView({ w = 800, h = 420, pins = [], route, heat, labels = true } = {}) {
  let out = `<rect width="${w}" height="${h}" fill="var(--map-land,#EEF1F4)"/>`;
  out += `<path d="M0 ${h * 0.72} C ${w * 0.2} ${h * 0.62}, ${w * 0.35} ${h * 0.86}, ${w * 0.55} ${h * 0.78} S ${w * 0.85} ${h * 0.6}, ${w} ${h * 0.68} L ${w} ${h} L 0 ${h} Z" fill="var(--map-water,#D6E7EB)"/>`;
  out += `<rect x="${w * 0.62}" y="${h * 0.12}" width="${w * 0.14}" height="${h * 0.22}" rx="8" fill="var(--map-park,#E1EAE2)"/><rect x="${w * 0.08}" y="${h * 0.18}" width="${w * 0.1}" height="${h * 0.16}" rx="8" fill="var(--map-park,#E1EAE2)"/>`;
  const roads = [[0, 0.3, 1, 0.24], [0, 0.55, 1, 0.5], [0.22, 0, 0.3, 1], [0.48, 0, 0.44, 0.75], [0.74, 0, 0.82, 0.62], [0.05, 0.9, 0.6, 0.0]];
  roads.forEach(([x1, y1, x2, y2], i) => { out += `<line x1="${x1 * w}" y1="${y1 * h}" x2="${x2 * w}" y2="${y2 * h}" stroke="var(--map-road,#FFFFFF)" stroke-width="${i < 2 ? 9 : 6}" stroke-linecap="round"/>`; });
  for (let i = 0; i < 18; i++) { const x = ((i * 137) % 100) / 100 * w, y = ((i * 71) % 100) / 100 * h; out += `<line x1="${x}" y1="${y}" x2="${x + 60}" y2="${y + 18}" stroke="var(--map-road,#FFFFFF)" stroke-width="3" stroke-linecap="round" opacity=".9"/>`; }
  if (heat) heat.forEach(([x, y, r]) => { out += `<circle cx="${x * w}" cy="${y * h}" r="${r}" fill="var(--primary)" opacity="0.10"/><circle cx="${x * w}" cy="${y * h}" r="${r * 0.55}" fill="var(--primary)" opacity="0.12"/>`; });
  if (route) out += `<path d="${route.map(([x, y], i) => `${i ? 'L' : 'M'}${x * w} ${y * h}`).join(' ')}" fill="none" stroke="var(--primary)" stroke-width="3.5" stroke-dasharray="1 7" stroke-linecap="round"/>`;
  pins.forEach(({ x, y, tone = 'primary', label, n, person }) => {
    const fill = { primary: 'var(--primary)', danger: 'var(--danger)', warning: 'var(--warning)', success: 'var(--success)', neutral: 'var(--graphite-500)' }[tone];
    const X = x * w, Y = y * h;
    if (person) out += `<circle cx="${X}" cy="${Y}" r="14" fill="var(--bg-surface)" stroke="${fill}" stroke-width="2.5"/><text x="${X}" y="${Y + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${fill}">${person}</text>`;
    else out += `<path d="M${X} ${Y} c-7 -9 -11 -13 -11 -19 a11 11 0 0 1 22 0 c0 6 -4 10 -11 19z" fill="${fill}" stroke="#fff" stroke-width="2"/><circle cx="${X}" cy="${Y - 19}" r="${n ? 7.5 : 4}" fill="#fff"/>${n ? `<text x="${X}" y="${Y - 15.5}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${fill}">${n}</text>` : ''}`;
    if (label && labels) out += `<g><rect x="${X + 14}" y="${Y - 30}" rx="6" height="22" width="${label.length * 6.4 + 16}" fill="var(--bg-surface)" stroke="var(--border)"/><text x="${X + 22}" y="${Y - 15}" font-size="11.5" font-weight="500" fill="var(--text)">${label}</text></g>`;
  });
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" style="display:block">${out}</svg>`;
}

// ── Floor plan ─────────────────────────────────────────────
// rooms: [x, y, w, h, label, tone?]   tones: free|busy|sel|warn|danger|muted|core
export function floorPlan({ w = 900, h = 520, rooms = [], desks = [], pins = [], scale = 1, title } = {}) {
  const fills = { free: 'var(--success-soft)', busy: 'var(--primary-soft)', sel: 'var(--primary)', warn: 'var(--warning-soft)', danger: 'var(--danger-soft)', muted: 'var(--bg-muted)', core: 'var(--graphite-150)', '': 'var(--bg-surface)' };
  let out = `<rect width="${w}" height="${h}" fill="var(--bg-subtle)"/>`;
  out += `<rect x="20" y="20" width="${w - 40}" height="${h - 40}" rx="4" fill="var(--bg-surface)" stroke="var(--graphite-700)" stroke-width="3"/>`;
  rooms.forEach(([x, y, rw, rh, label, tone = '']) => {
    out += `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${fills[tone]}" stroke="var(--graphite-500)" stroke-width="1.5"/>`;
    if (label) out += `<text x="${x + rw / 2}" y="${y + rh / 2 + 4}" text-anchor="middle" font-size="11.5" font-weight="500" fill="${tone === 'sel' ? '#fff' : 'var(--text-muted)'}">${label}</text>`;
  });
  desks.forEach(([x, y, st = 'free', rot = 0]) => {
    const f = { free: 'var(--success)', busy: 'var(--primary)', mine: 'var(--warning)', off: 'var(--graphite-300)' }[st];
    out += `<g transform="rotate(${rot} ${x + 14} ${y + 10})"><rect x="${x}" y="${y}" width="28" height="20" rx="3" fill="var(--bg-surface)" stroke="${f}" stroke-width="2"/><circle cx="${x + 14}" cy="${y + 27}" r="5" fill="${f}" opacity="${st === 'off' ? 0.5 : 0.9}"/></g>`;
  });
  pins.forEach(([x, y, icon, tone = 'primary']) => {
    const fill = { primary: 'var(--primary)', danger: 'var(--danger)', warning: 'var(--warning)', success: 'var(--success)' }[tone];
    const inner = I(icon).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    out += `<circle cx="${x}" cy="${y}" r="13" fill="${fill}" stroke="#fff" stroke-width="2.5"/><svg x="${x - 8}" y="${y - 8}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  });
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" style="display:block">${out}</svg>`;
}

// ── App shell ──────────────────────────────────────────────
const NAV = [
  ['', [['home', 'Home', 'dashboard'], ['helpdesk', 'Helpdesk', 'helpdesk', 11], ['work-orders', 'Work orders', 'work-order', 11, true], ['ppm', 'Planned maintenance', 'ppm'], ['dispatch', 'Scheduling', 'dispatch']]],
  ['Estate', [['assets', 'Assets', 'asset'], ['locations', 'Locations', 'location'], ['space', 'Space & floor plans', 'floor-plan'], ['documents', 'Documents', 'documents']]],
  ['Compliance', [['compliance', 'Compliance', 'compliance', '3', true], ['inspections', 'Inspections & audits', 'inspection'], ['safety', 'Health & safety', 'health-safety']]],
  ['Commercial', [['contractors', 'Contractors', 'contractor'], ['contracts', 'Contracts & SLAs', 'contract'], ['inventory', 'Inventory', 'inventory'], ['purchasing', 'Purchasing', 'procurement'], ['finance', 'Finance', 'finance']]],
  ['Workplace', [['bookings', 'Bookings', 'booking'], ['visitors', 'Visitors', 'visitor']]],
  ['Insights', [['energy', 'Energy & carbon', 'energy'], ['reports', 'Reports', 'reports']]],
];
const EXTRA = { projects: ['Projects', 'projects'], leases: ['Real estate', 'real-estate'], capital: ['Capital planning', 'capital-planning'], iot: ['IoT & sensors', 'iot'], fleet: ['Fleet', 'fleet'], keys: ['Keys', 'keys'], moves: ['Moves', 'moves'], soft: ['Soft services', 'soft-services'], continuity: ['Business continuity', 'continuity'], housing: ['Housing', 'housing'], ai: ['Ask the estate', 'ai-assistant'], admin: ['Administration', 'admin'], platform: ['Platform admin', 'globe'] };

export function nav(active, { tenant = 'Demo Estates Ltd', plan = 'Enterprise', user = 'Morgan Ellis', role = 'FM Manager', collapsed = false, toggle = collapsed, tipFor = '' } = {}) {
  const item = ([key, label, icon, count, alert]) => `<div class="nav-item ${key === active ? 'active' : ''}${key === tipFor ? ' tip' : ''}"${collapsed ? ` data-label="${label}"` : ''}>${I(icon)}<span>${label}</span>${count ? `<span class="count ${alert ? 'alert' : ''}">${count}</span>` : ''}</div>`;
  const inBase = NAV.some(([, items]) => items.some(([k]) => k === active));
  let html = NAV.map(([label, items]) => `<div class="nav-sec">${label ? `<div class="nav-label">${label}</div>` : ''}${items.map(item).join('')}</div>`).join('');
  const more = !inBase && EXTRA[active] && active !== 'admin' && active !== 'platform' ? item([active, ...EXTRA[active]]) : '';
  html += `<div class="nav-sec"><div class="nav-label">More</div>${more}<div class="nav-item">${I('more')}<span>All modules</span></div>${item(['admin', 'Administration', 'admin'])}</div>`;
  return `<aside class="nav"><div class="nav-top">${toggle ? `<div class="row between"><div class="brand"><span class="brand-mark">${logo(28)}</span><span class="brand-word">${wordmark({ inverse: true, width: 102 })}</span></div><span class="nav-toggle">${I(collapsed ? 'panel-left-open' : 'panel-left-close')}</span></div>` : `<div class="brand"><span class="brand-mark">${logo(28)}</span><span class="brand-word">${wordmark({ inverse: true, width: 102 })}</span></div>`}<div class="tenant"><span class="t-logo">DE</span><div class="grow"><div class="t-name">${tenant}</div><div class="t-sub">${plan}</div></div>${I('chevron-down', 's14')}</div></div><div class="nav-scroll">${html}</div><div class="nav-foot"><span class="av s28" style="background:#1D3A40;color:#A8DCE3">${initials(user)}</span><div class="grow"><div class="who">${user}</div><div class="xs">${role}</div></div>${I('settings', 's14')}</div></aside>`;
}
export function topbar(crumbs = []) {
  const c = crumbs.map((x, i) => (i === crumbs.length - 1 ? `<b>${x}</b>` : `<span>${x}</span>${I('chevron-right')}`)).join('');
  return `<header class="topbar"><div class="crumbs">${c}</div><div class="gsearch">${I('search', 's14')}<span>Search jobs, assets, sites, people…</span>${kbd('⌘K')}</div><span class="tb-icon">${I('ai-assistant', 's18')}</span><span class="tb-icon">${I('notifications', 's18')}<span class="pip"></span></span><span class="tb-icon">${I('info', 's18')}</span></header>`;
}
export function pageHead(title, { sub = '', acts = '', eyebrow = '' } = {}) {
  return `<div class="page-head"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1 class="page-title">${title}</h1>${sub ? `<div class="page-sub">${sub}</div>` : ''}</div><div class="page-actions">${join(acts)}</div></div>`;
}
export function shell({ active, crumbs, title, sub, acts, eyebrow, body, tight, user, overlay = '', collapsed = false, toggle = collapsed, tipFor = '' }) {
  return `<div class="app${collapsed ? ' nav-collapsed' : ''}">${nav(active, { ...user, collapsed, toggle, tipFor })}<main class="main">${topbar(crumbs)}<div class="page ${tight ? 'tight' : ''}">${title ? pageHead(title, { sub, acts, eyebrow }) : ''}${join(body)}</div></main></div>${overlay}`;
}

// ── Devices ───────────────────────────────────────────────
export const statusBar = (time = '09:41') => `<div class="status"><span>${time}</span><span class="row g1"><svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg><svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.5zM3.3 6.7a6.6 6.6 0 0 1 9.4 0l-1.4 1.4a4.6 4.6 0 0 0-6.6 0L3.3 6.7zM1 4.4a9.9 9.9 0 0 1 14 0l-1.4 1.4a7.9 7.9 0 0 0-11.2 0L1 4.4z" fill="currentColor"/></svg><svg width="24" height="12" viewBox="0 0 24 12"><rect x="0.5" y="0.5" width="20" height="11" rx="3" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="15" height="8" rx="1.5" fill="currentColor"/><rect x="21.5" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".5"/></svg></span></div>`;
export const phone = (inner, { tabsOn = 0, noTabs, tabsSet } = {}) => {
  const set = tabsSet || [['My jobs', 'work-order'], ['Scan', 'scan'], ['Raise', 'add'], ['Me', 'user']];
  return `<div class="phone"><div class="phone-in"><span class="island"></span>${statusBar()}${inner}${noTabs ? '' : `<div class="m-tabs">${set.map(([l, i], k) => `<span class="${k === tabsOn ? 'on' : ''}">${I(i)}${l}</span>`).join('')}</div>`}</div></div>`;
};
export const tablet = (inner) => `<div class="tablet"><div class="tablet-in">${inner}</div></div>`;
