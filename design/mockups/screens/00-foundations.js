import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appIcon, fms, wordmark } from '../../tools/logo.js';
import { I, logo, btn, badge, chip, prio, av, avs, field, input, select, sw, cb, seg, tabs, kpi, spark, callout, status, card, table, ref, bar } from '../src/lib.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'icons/icons.json'), 'utf8'));
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'tokens/tokens.json'), 'utf8')).light;

const sheet = (title, sub, body, { dark } = {}) => `<div style="padding:44px 52px;min-height:100vh;background:var(--bg-app)"><div class="row" style="gap:14px;margin-bottom:28px">${logo(36, dark ? { bg: '#2A8090' } : undefined)}<div><div class="page-title" style="font-size:26px">${title}</div><div class="page-sub">${sub}</div></div><span class="grow"></span><span class="badge outline">Design system v1 · Nov 2026</span></div>${body}</div>`;

// ── Colour sheet ──
const ramp = (name, label, keys, note) => `<div class="card"><div class="card-h"><div class="col" style="gap:2px"><span class="card-t">${label}</span><span class="card-s">${note}</span></div></div><div class="card-b"><div class="grid" style="grid-template-columns:repeat(${keys.length},1fr);gap:8px">${keys.map((k) => `<div class="col" style="gap:6px"><div class="swatch" style="background:${tokens[`${name}-${k}`]}"></div><div class="xs medium">${k}</div><div class="xs mono faint">${tokens[`${name}-${k}`]}</div></div>`).join('')}</div></div></div>`;
const semantic = [
  ['Primary action', 'var(--primary)', '#fff', 'Buttons, links, focus, selection'],
  ['Success', 'var(--success)', '#fff', 'Compliant, completed, within SLA'],
  ['Warning', 'var(--warning)', '#fff', 'Due soon, at risk, awaiting'],
  ['Danger', 'var(--danger)', '#fff', 'Overdue, breached, failed, P1'],
  ['Navigation', 'var(--nav-bg)', '#F1F3F6', 'Dark graphite rail, both themes'],
];
const colours = sheet('Colour', 'Graphite neutrals do 90% of the work. One accent (Petrol). Three muted status colours, used only for state.', `
<div class="stack g6">
  <div class="grid g-5">${semantic.map(([n, bg, fg, use]) => `<div class="card" style="overflow:hidden"><div style="height:96px;background:${bg};color:${fg};padding:14px;font-weight:600">${n}</div><div class="card-b sm muted" style="padding:12px 14px">${use}</div></div>`).join('')}</div>
  ${ramp('petrol', 'Petrol: brand accent', ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'], 'Teal-blue, hue ≈ 192°. 600 is the primary; 50–100 for selected and soft backgrounds.')}
  ${ramp('graphite', 'Graphite: neutrals', ['0', '25', '50', '100', '150', '200', '300', '400', '500', '600', '700', '800', '900', '950'], 'Cool grey. Text 900 / 600 / 500, borders 200, page background 50.')}
  <div class="grid g-3">
    ${ramp('green', 'Success', ['50', '100', '500', '600', '700'], 'Status only')}
    ${ramp('amber', 'Warning', ['50', '100', '500', '600', '700'], 'Status only')}
    ${ramp('red', 'Danger', ['50', '100', '500', '600', '700'], 'Status only')}
  </div>
  <div class="grid g-2">
    ${card('Status in use', `<div class="row wrap" style="gap:8px">${['Compliant', 'Due soon', 'Overdue', 'In progress', 'Awaiting parts', 'Completed', 'Draft', 'Breached'].map(status).join('')}</div><div class="divider"></div><div class="grid g-4" style="gap:8px">${['g', 'a', 'r', 'n'].map((t, i) => `<div class="rag ${t}">${['98%', '86%', '61%', 'N/A'][i]}</div>`).join('')}</div>`)}
    ${card('Accessibility', `<div class="stack g2 sm">${[['Body text on surface', '17.5 : 1'], ['Muted text', '7.5 : 1'], ['Faint text (smallest allowed)', '5.2 : 1'], ['White on primary button', '6.6 : 1'], ['Input borders (WCAG 1.4.11)', '3.1 : 1'], ['Dark theme: white on primary', '4.6 : 1']].map(([a, b]) => `<div class="row between"><span>${a}</span><span class="badge success sm">${b} AA</span></div>`).join('')}</div><div class="hint" style="margin-top:10px">Every pair is checked by <span class="code">tools/contrast.js</span>. Colour is never the only signal: status badges always carry a word.</div>`)}
  </div>
</div>`);

// ── Typography ──
const typeRows = [['Display / login', 36, 600, 'Every building, safe and compliant.'], ['Page title', 22, 600, 'Work orders'], ['KPI value', 28, 600, '96.4%'], ['Section title', 16, 600, 'Upcoming PPM'], ['Card title', 14, 600, 'SLA performance'], ['Body (base)', 14, 400, 'Boiler 2 is losing pressure overnight; reset twice this week.'], ['Small / table', 13, 400, 'Cardiff HQ · Plant room B1'], ['Caption', 12, 400, 'Updated 4 minutes ago by Hana Patel'], ['Reference (mono)', 12.5, 500, 'WO-CDF-2026-04812']];
const type = sheet('Typography', 'Inter for UI, Inter Display for large sizes, JetBrains Mono for references and codes. Base size 14px, 4px grid.', `
<div class="grid g-21"><div class="card"><div class="card-b flush">${typeRows.map(([n, s, wt, t], i) => `<div class="row" style="padding:16px 22px;border-bottom:${i < typeRows.length - 1 ? '1px solid var(--border-subtle)' : '0'};gap:24px"><div style="width:180px" class="col"><span class="sm medium">${n}</span><span class="xs faint mono">${s}px · ${wt}</span></div><div style="font-size:${s}px;font-weight:${wt};${s >= 20 ? 'font-family:var(--font-display);letter-spacing:-0.015em' : ''}${n.includes('mono') ? ';font-family:var(--font-mono)' : ''}">${t}</div></div>`).join('')}</div></div>
<div class="stack">${card('Weights', `<div class="stack g2"><div style="font-size:20px">Regular 400: body copy</div><div style="font-size:20px;font-weight:500">Medium 500: labels, buttons</div><div style="font-size:20px;font-weight:600">Semibold 600: titles, values</div></div>`)}
${card('Numbers', `<div class="hint" style="margin-bottom:8px">Tabular figures in tables and KPIs so columns line up.</div><table class="tbl dense"><tbody>${[['£12,480.00', '1,204'], ['£980.50', '86'], ['£104,220.00', '12,930']].map(([a, b]) => `<tr><td class="num">${a}</td><td class="num">${b}</td></tr>`).join('')}</tbody></table>`)}
${card('Voice', `<div class="stack g2 sm"><div><b>Plain and specific.</b> "Boiler 2 inspection is 3 days overdue", not "Compliance issue detected".</div><div><b>UK English.</b> Colour, organisation, licence, £, DD/MM/YYYY.</div><div><b>Sentence case</b> for every label and title.</div></div>`)}</div></div>`);

// ── Icon sheets ──
const cats = [...new Set(manifest.map((m) => m.category))];
const iconGrid = (dark) => sheet('Icons', `${manifest.length} icons · 24px grid · 2px stroke (1.75 at 16px in UI) · round caps · currentColor. ${manifest.filter((m) => m.source === 'custom').length} custom CAFM icons marked ●; the rest from Lucide (ISC licence).`, `<div class="stack">${cats.map((c) => `<div class="card"><div class="card-h"><span class="card-t">${c}</span><span class="card-s">${manifest.filter((m) => m.category === c).length}</span></div><div class="card-b"><div class="grid" style="grid-template-columns:repeat(10,1fr);gap:6px">${manifest.filter((m) => m.category === c).map((m) => `<div class="col" style="align-items:center;gap:8px;padding:12px 4px;border-radius:8px;background:var(--bg-subtle);position:relative">${m.source === 'custom' ? '<span style="position:absolute;top:6px;right:8px;width:6px;height:6px;border-radius:50%;background:var(--primary)"></span>' : ''}<span style="color:var(--text)">${I(m.name, 's24')}</span><span class="xs muted center" style="line-height:14px">${m.name}</span></div>`).join('')}</div></div></div>`).join('')}</div>`, { dark });
const customSheet = sheet('Custom CAFM icons', 'Drawn on the Lucide grid so they sit alongside it seamlessly. Shown at 48px (construction) and 24 / 20 / 16px (use).', `<div class="grid g-4">${manifest.filter((m) => m.source === 'custom').map((m) => `<div class="card"><div class="card-b row" style="gap:18px"><div style="width:72px;height:72px;border-radius:10px;background-color:var(--bg-subtle);background-image:linear-gradient(var(--border-subtle) 1px,transparent 1px),linear-gradient(90deg,var(--border-subtle) 1px,transparent 1px);background-size:3px 3px;display:grid;place-items:center;color:var(--text)">${I(m.name).replace('class="i ', 'style="width:48px;height:48px;stroke-width:2" class="')}</div><div class="col" style="gap:8px"><span class="sm medium">${m.name}</span><span class="row" style="gap:10px;color:var(--text-muted)">${I(m.name, 's24')}${I(m.name, 's20')}${I(m.name)}</span><span class="row" style="gap:10px;color:var(--primary)">${I(m.name, 's20')}<span class="ic primary" style="width:28px;height:28px;border-radius:7px;display:grid;place-items:center">${I(m.name)}</span></span></div></div></div>`).join('')}</div>`);
const usage = sheet('Icons in use', 'Sizes, colour rules and pairing with components.', `<div class="grid g-2">
${card('Sizes', `<div class="row" style="gap:36px;align-items:flex-end">${[['16', ''], ['18', 's18'], ['20', 's20'], ['24', 's24'], ['32', 's32']].map(([n, c]) => `<div class="col" style="align-items:center;gap:8px">${I('boiler', c)}<span class="xs faint">${n}px</span></div>`).join('')}</div><div class="hint" style="margin-top:14px">16px in tables, buttons and menus · 18px top bar · 20px mobile lists · 24px mobile tabs and empty states · 32px illustrations.</div>`)}
${card('Colour rules', `<div class="stack g3 sm"><div class="row g3"><span style="color:var(--text-muted)">${I('asset', 's20')}</span>Default: muted text colour</div><div class="row g3"><span style="color:var(--primary)">${I('compliance', 's20')}</span>Active / selected: primary</div><div class="row g3"><span style="color:var(--danger)">${I('warning', 's20')}</span>Status only: success / warning / danger, always with text</div><div class="row g3"><span class="ic primary" style="width:32px;height:32px;border-radius:8px;display:grid;place-items:center">${I('ppm')}</span>Tinted tile for list items and module headers</div></div>`)}
${card('In components', `<div class="stack g3"><div class="row wrap">${btn('New work order', { v: 'primary', icon: 'add' })}${btn('Filter', { icon: 'filter' })}${btn('Export', { icon: 'export' })}${btn('', { icon: 'more', iconOnly: true })}</div><div class="row wrap">${badge('Gas safety', 'outline', { icon: 'gas-safety' })}${badge('Legionella', 'outline', { icon: 'water-hygiene' })}${badge('LOLER', 'outline', { icon: 'lift' })}${badge('Asbestos', 'outline', { icon: 'asbestos' })}</div>${input('Search assets', { ph: true, icon: 'search' })}</div>`)}
${card('Module headers', `<div class="grid g-4" style="gap:10px">${[['Helpdesk', 'helpdesk'], ['PPM', 'ppm'], ['Compliance', 'compliance'], ['Assets', 'asset'], ['Space', 'floor-plan'], ['Energy', 'energy'], ['Contractors', 'contractor'], ['IoT', 'iot']].map(([l, i]) => `<div class="col" style="align-items:center;gap:8px;padding:14px;border:1px solid var(--border-subtle);border-radius:10px"><span class="ic primary" style="width:40px;height:40px;border-radius:10px;display:grid;place-items:center">${I(i, 's20')}</span><span class="sm medium">${l}</span></div>`).join('')}</div>`)}
</div>`);

// ── Logo ──
const logoSheet = sheet('Logo', 'The name is the logo: a heavy Bodoni serif with "FM" upright and "Stead" in italic Petrol. "FMS" is the short form, and "FM" on a tile is the mark for small sizes.', `<div class="grid g-3">
${card('Primary', `<div style="height:200px;display:grid;place-items:center;background:var(--bg-subtle);border-radius:10px">${wordmark({ width: 330 })}</div>`)}
${card('On dark (navigation)', `<div style="height:200px;display:grid;place-items:center;background:var(--nav-bg);border-radius:10px">${wordmark({ inverse: true, width: 330 })}</div>`)}
${card('Short form', `<div style="height:200px;display:grid;place-items:center;background:var(--bg-subtle);border-radius:10px">${fms({ width: 190 })}</div>`)}
${card('Mark, favicon and app icon', `<div class="row" style="gap:28px;align-items:flex-end;height:120px">${[96, 64, 48, 32, 16].map((s) => `<div class="col" style="align-items:center;gap:8px">${logo(s)}<span class="xs faint">${s}</span></div>`).join('')}<div class="col" style="align-items:center;gap:8px">${appIcon(96)}<span class="xs faint">App icon</span></div></div>`, { cls: 'span-2' })}
${card('Clear space', `<div style="height:120px;display:grid;place-items:center"><div style="padding:16px;border:1px dashed var(--primary-border);border-radius:12px">${wordmark({ width: 200 })}</div></div><div class="hint">Keep the height of the "M" clear on all sides. Below 100px wide, use the mark.</div>`)}
</div>`);

// ── Components ──
const components = sheet('Core components', 'The building blocks every screen is made from. Implemented once in the shared UI package.', `<div class="grid g-3">
${card('Buttons', `<div class="stack g3"><div class="row wrap">${btn('Primary', { v: 'primary' })}${btn('Secondary')}${btn('Ghost', { v: 'ghost' })}${btn('Delete', { v: 'danger', icon: 'delete' })}</div><div class="row wrap">${btn('Small', { sm: true, v: 'primary' })}${btn('Small', { sm: true })}${btn('Large action', { lg: true, v: 'primary', icon: 'add' })}</div><div class="row wrap"><span class="btn-group">${btn('Day')}${btn('Week')}${btn('Month')}</span>${btn('', { icon: 'more', iconOnly: true })}</div></div>`)}
${card('Badges & priority', `<div class="stack g3"><div class="row wrap">${badge('Neutral')}${badge('Primary', 'primary')}${badge('Success', 'success', { dot: true })}${badge('Warning', 'warning', { dot: true })}${badge('Danger', 'danger', { dot: true })}${badge('Outline', 'outline')}</div><div class="row wrap" style="gap:16px">${prio(1)}${prio(2)}${prio(3)}${prio(4)}</div><div class="row wrap">${chip('Site', 'Cardiff HQ', true)}${chip('Priority')}${chip('Assigned to')}</div></div>`)}
${card('Form controls', `<div class="stack g3">${field('Location', select('Cardiff HQ › Level 2 › Kitchen'), { req: true })}${field('Description', input('Leak under sink, water on floor', { focus: true }))}<div class="row g4"><span class="row">${cb(true)}<span class="sm">Notify requester</span></span><span class="row">${sw(true)}<span class="sm">Out of hours</span></span></div></div>`)}
${card('Navigation', `<div class="stack g3">${tabs([['Overview'], ['History', 24], ['Documents', 6], ['Meters']], 0)}${seg([['List', 'chart-bar'], ['Board', 'dispatch'], ['Map', 'map'], ['Calendar', 'booking']], 0)}</div>`)}
${card('People', `<div class="stack g3"><div class="row g3">${av('Tom Price')}${av('Aisha Khan', { g: true })}${av('Sparks Electrical', { co: true })}${avs(['Tom Price', 'Gareth Evans', 'Megan Hughes', 'Dylan Morgan'])}</div><div class="row">${av('Hana Patel', { s: 's36' })}<div class="col" style="gap:0"><span class="medium">Hana Patel</span><span class="xs faint">Helpdesk · Cardiff HQ</span></div></div></div>`)}
${card('Progress & alerts', `<div class="stack g3">${bar(72)}${bar(91, 'success')}${bar(48, 'warning')}${callout('Two certificates expire this week. <a>Review</a>', { tone: 'warning', icon: 'warning' })}</div>`)}
<div class="span-2">${card('Data table', table(['Reference', 'Title', 'Site', 'Priority', 'Status'], [[ref('WO-04812'), 'Boiler 2 losing pressure', 'Cardiff HQ', prio(2), status('In progress')], [ref('WO-04809'), 'Replace emergency light, stair 3', 'Bristol Office', prio(3), status('Assigned')], [ref('WO-04801'), 'Water leak, kitchen L2', 'Cardiff HQ', prio(1), status('Overdue')]], { dense: true }), { flush: true })}</div>
${kpi('PPM compliance', '96.4', { unit: '%', delta: '+1.8 pts', sub: 'vs last month', spark: spark([91, 92, 93, 92, 94, 95, 96.4], { w: 300, h: 36 }) })}
</div>`);

const spacing = sheet('Layout, spacing & elevation', 'Desktop shell, 4px spacing grid, radii and shadows.', `<div class="grid g-2">
${card('App shell', `<div style="display:grid;grid-template-columns:110px 1fr;height:260px;border:1px solid var(--border);border-radius:10px;overflow:hidden"><div style="background:var(--nav-bg);padding:10px;color:#A9B1BC;font-size:11px">Navigation<br>248px<br><br>Dark graphite,<br>collapsible to 64px</div><div style="display:grid;grid-template-rows:34px 1fr"><div style="border-bottom:1px solid var(--border);padding:8px 12px;font-size:11px" class="faint">Top bar 56px · breadcrumbs · ⌘K search · AI · notifications</div><div style="padding:14px;background:var(--bg-app);font-size:11px" class="faint">Page · 32px side padding · max content 1440px<div style="margin-top:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${'<div style="height:40px;background:var(--bg-surface);border:1px solid var(--border);border-radius:6px"></div>'.repeat(4)}</div><div style="margin-top:8px;height:110px;background:var(--bg-surface);border:1px solid var(--border);border-radius:6px"></div></div></div></div>`)}
${card('Spacing scale (4px grid)', `<div class="stack g2">${[2, 4, 8, 12, 16, 20, 24, 32, 48, 64].map((s) => `<div class="row g3"><span class="xs mono faint" style="width:36px">${s}</span><span style="height:12px;width:${s * 4}px;background:var(--primary-soft);border:1px solid var(--primary-border);border-radius:3px"></span></div>`).join('')}</div>`)}
${card('Radius', `<div class="row" style="gap:20px">${[['4', 'badges'], ['6', 'controls'], ['8', 'menus'], ['12', 'cards'], ['16', 'modals']].map(([r, u]) => `<div class="col" style="align-items:center;gap:8px"><div style="width:72px;height:56px;border:1.5px solid var(--border-strong);border-radius:${r}px;background:var(--bg-subtle)"></div><span class="xs medium">${r}px</span><span class="xs faint">${u}</span></div>`).join('')}</div>`)}
${card('Elevation', `<div class="row" style="gap:24px;padding:12px 4px">${[['xs', 'cards'], ['sm', 'raised'], ['md', 'menus'], ['lg', 'modals']].map(([s, u]) => `<div class="col" style="align-items:center;gap:10px"><div style="width:84px;height:60px;border-radius:10px;background:var(--bg-surface);box-shadow:var(--shadow-${s})"></div><span class="xs medium">${s}</span><span class="xs faint">${u}</span></div>`).join('')}</div>`)}
</div>`);

const dark = { id: 'ds-07-icons-dark', group: 'Design system', title: 'Icons (dark theme)', theme: 'dark', viewport: 'sheet', html: iconGrid(true) };
export default [
  { id: 'ds-01-colour', group: 'Design system', title: 'Colour', viewport: 'sheet', html: colours },
  { id: 'ds-02-typography', group: 'Design system', title: 'Typography', viewport: 'sheet', html: type },
  { id: 'ds-03-components', group: 'Design system', title: 'Core components', viewport: 'sheet', html: components },
  { id: 'ds-04-layout', group: 'Design system', title: 'Layout, spacing & elevation', viewport: 'sheet', html: spacing },
  { id: 'ds-05-logo', group: 'Design system', title: 'Logo', viewport: 'sheet', html: logoSheet },
  { id: 'ds-06-icons', group: 'Design system', title: 'Icons: full set', viewport: 'sheet', html: iconGrid() },
  dark,
  { id: 'ds-08-icons-custom', group: 'Design system', title: 'Custom CAFM icons', viewport: 'sheet', html: customSheet },
  { id: 'ds-09-icons-usage', group: 'Design system', title: 'Icons in use', viewport: 'sheet', html: usage },
];
