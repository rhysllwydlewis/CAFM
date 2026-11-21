// Renders every screen defined in mockups/screens/*.js to:
//   mockups/html/<id>.html   standalone HTML (open in a browser to inspect)
//   mockups/png/<id>.png     2× screenshot
//   mockups/index.html       gallery of all screens
// Usage: node tools/render.js [filter]   (filter = substring of screen id)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = (p) => path.join(root, 'mockups', p);
const filter = process.argv[2] || '';

const VIEWPORTS = { desktop: [1440, 960], wide: [1600, 1000], board: [1440, 960], tablet: [1280, 900], a4: [860, 1180], sheet: [1440, 900] };

const files = fs.readdirSync(dir('screens')).filter((f) => f.endsWith('.js')).sort();
const screens = [];
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(dir('screens'), f)).href);
  for (const s of mod.default) screens.push({ ...s, file: f });
}
const ids = new Set();
for (const s of screens) { if (ids.has(s.id)) throw new Error(`duplicate screen id ${s.id}`); ids.add(s.id); }

const doc = (s) => `<!doctype html><html lang="en-GB" data-theme="${s.theme || 'light'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${s.title}</title><link rel="stylesheet" href="../src/styles.css"></head><body>${s.html}</body></html>`;

const todo = screens.filter((s) => s.id.includes(filter));
for (const s of todo) fs.writeFileSync(dir(`html/${s.id}.html`), doc(s));

const browser = await chromium.launch();
const queue = [...todo];
const warnings = [];
async function worker() {
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  while (queue.length) {
    const s = queue.shift();
    const [w, h] = VIEWPORTS[s.viewport || 'desktop'];
    await page.setViewportSize({ width: w, height: h });
    await page.goto(pathToFileURL(dir(`html/${s.id}.html`)).href);
    await page.evaluate(() => document.fonts.ready);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) warnings.push(`${s.id}: ${over}px wider than viewport`);
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.card, .page, .kcol, .m-card')].filter((e) => e.scrollWidth > e.clientWidth + 2).map((e) => (e.querySelector('.card-t')?.textContent || e.className).slice(0, 40)));
    if (clipped.length) warnings.push(`${s.id}: content wider than container in ${clipped.join(' | ')}`);
    await page.screenshot({ path: dir(`png/${s.id}.png`), fullPage: !s.fixed });
    process.stdout.write('.');
  }
  await ctx.close();
}
await Promise.all([worker(), worker(), worker(), worker()]);
await browser.close();
console.log(`\nrendered ${todo.length} screens`);
for (const w of warnings) console.log(`WARN ${w}`);

// Gallery index (always rebuilt from the full list)
const groups = {};
for (const s of screens) (groups[s.group] ||= []).push(s);
const gallery = Object.entries(groups).map(([g, list]) => `<section><h2>${g}</h2><div class="g">${list.map((s) => `<a href="html/${s.id}.html"><img loading="lazy" src="png/${s.id}.png" alt="${s.title}"><b>${s.title}</b><span>${s.id}</span></a>`).join('')}</div></section>`).join('');
fs.writeFileSync(dir('index.html'), `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>CAFM screen gallery</title><style>body{font-family:Inter,system-ui,sans-serif;margin:0;padding:32px 40px;background:#F6F7F9;color:#151A22}h1{font-size:24px;margin:0 0 4px}h2{font-size:15px;margin:32px 0 12px;color:#4D5562}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}a{display:flex;flex-direction:column;gap:6px;color:inherit;text-decoration:none;background:#fff;border:1px solid #D9DEE5;border-radius:12px;padding:10px}img{width:100%;border-radius:6px;border:1px solid #E4E7EC}b{font-size:13px}span{font-size:11.5px;color:#656E7A;font-family:'JetBrains Mono',monospace}</style></head><body><h1>CAFM screen gallery</h1><p style="color:#4D5562;margin:0">${screens.length} screens. Click any screen to open its HTML source.</p>${gallery}</body></html>`);
fs.writeFileSync(dir('screens.json'), JSON.stringify(screens.map(({ id, group, title, desc, viewport, theme, file }) => ({ id, group, title, desc, viewport: viewport || 'desktop', theme: theme || 'light', file })), null, 2) + '\n');
