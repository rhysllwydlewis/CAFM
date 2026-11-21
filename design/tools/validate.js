// Static checks run before rendering:
//  1. every icon referenced in screens/lib exists in the icon set
//  2. every SVG in icons/svg parses as well-formed XML with a 24×24 viewBox
//  3. screen ids are unique and follow <area>-<nn>-<name>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const icons = new Set(fs.readdirSync(path.join(root, 'icons/svg')).map((f) => f.replace('.svg', '')));
const errors = [];

const srcFiles = [...fs.readdirSync(path.join(root, 'mockups/screens')).map((f) => path.join(root, 'mockups/screens', f)), path.join(root, 'mockups/src/lib.js')];
for (const f of srcFiles) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\bI\('([a-z0-9-]+)'[,)]/g)) if (!icons.has(m[1])) errors.push(`${path.basename(f)}: unknown icon "${m[1]}"`);
  for (const m of text.matchAll(/icon: '([a-z0-9-]+)'/g)) if (!icons.has(m[1])) errors.push(`${path.basename(f)}: unknown icon "${m[1]}"`);
}

for (const name of icons) {
  const svg = fs.readFileSync(path.join(root, 'icons/svg', `${name}.svg`), 'utf8');
  if (!/viewBox="0 0 24 24"/.test(svg)) errors.push(`${name}.svg: viewBox is not 0 0 24 24`);
  if (!/stroke="currentColor"/.test(svg)) errors.push(`${name}.svg: not using currentColor`);
  const open = (svg.match(/<(path|circle|rect|line|polyline|polygon|ellipse|g)\b/g) || []).length;
  const closed = (svg.match(/\/>|<\/(path|circle|rect|line|polyline|polygon|ellipse|g)>/g) || []).length;
  if (open !== closed) errors.push(`${name}.svg: ${open} elements opened, ${closed} closed`);
}

const ids = new Set();
for (const f of fs.readdirSync(path.join(root, 'mockups/screens')).sort()) {
  const mod = await import(pathToFileURL(path.join(root, 'mockups/screens', f)).href);
  for (const s of mod.default) {
    if (ids.has(s.id)) errors.push(`${f}: duplicate screen id ${s.id}`);
    ids.add(s.id);
    if (!/^[a-z]+-\d{2}-[a-z0-9-]+$/.test(s.id)) errors.push(`${f}: screen id "${s.id}" should look like area-01-name`);
    if (!s.title || !s.group) errors.push(`${f}: ${s.id} missing title or group`);
  }
}

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`validate: ${icons.size} icons OK, ${ids.size} screens OK`);
