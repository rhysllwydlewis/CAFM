// Builds the product icon set from tools/icon-catalogue.js:
//   icons/svg/<name>.svg   one normalised SVG per icon (currentColor)
//   icons/sprite.svg       <symbol> sprite for the web app
//   icons/icons.json       manifest: name, category, source
//   icons/logo/*.svg       logomark, wordmark, FMS and app icon
//   tokens/tokens.json     tokens exported from tokens.css
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogue } from './icon-catalogue.js';
import { custom, logomark } from './custom-icons.js';
import { appIcon, fms, wordmark } from './logo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lucideDir = path.join(root, 'node_modules/lucide-static/icons');
const outDir = path.join(root, 'icons/svg');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const head = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';

export function innerOf(source, name) {
  if (source === 'custom') {
    if (!custom[name]) throw new Error(`custom icon missing: ${name}`);
    return custom[name];
  }
  const file = path.join(lucideDir, source.replace('lucide:', '') + '.svg');
  if (!fs.existsSync(file)) throw new Error(`lucide icon missing for ${name}: ${source}`);
  const svg = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim().replace(/\n\s*/g, '');
}

const manifest = [];
const symbols = [];
const seen = new Set();
for (const [category, icons] of Object.entries(catalogue)) {
  for (const [name, source] of Object.entries(icons)) {
    if (seen.has(name)) throw new Error(`duplicate icon name: ${name}`);
    seen.add(name);
    const inner = innerOf(source, name);
    fs.writeFileSync(path.join(outDir, `${name}.svg`), `${head}${inner}</svg>\n`);
    symbols.push(`<symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`);
    manifest.push({ name, category, source: source === 'custom' ? 'custom' : source });
  }
}
fs.writeFileSync(path.join(root, 'icons/sprite.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n${symbols.join('\n')}\n</svg>\n`);
fs.writeFileSync(path.join(root, 'icons/icons.json'), JSON.stringify(manifest, null, 2) + '\n');

// Logomark variants
const logoDir = path.join(root, 'icons/logo');
fs.mkdirSync(logoDir, { recursive: true });
fs.writeFileSync(path.join(logoDir, 'logomark.svg'), logomark(32) + '\n');
fs.writeFileSync(path.join(logoDir, 'logomark-inverse.svg'), logomark(32, { bg: '#FFFFFF', fg: '#136676' }) + '\n');
fs.writeFileSync(path.join(logoDir, 'logomark-dark.svg'), logomark(32, { bg: '#2A8090', fg: '#FFFFFF' }) + '\n');
fs.writeFileSync(path.join(logoDir, 'wordmark.svg'), wordmark() + '\n');
fs.writeFileSync(path.join(logoDir, 'wordmark-inverse.svg'), wordmark({ inverse: true }) + '\n');
fs.writeFileSync(path.join(logoDir, 'fms.svg'), fms() + '\n');
fs.writeFileSync(path.join(logoDir, 'fms-inverse.svg'), fms({ inverse: true }) + '\n');
fs.writeFileSync(path.join(logoDir, 'app-icon.svg'), appIcon() + '\n');

// Lucide licence notice
fs.copyFileSync(path.join(root, 'node_modules/lucide-static/LICENSE'), path.join(root, 'icons/LICENSE-lucide.txt'));

// tokens.json from tokens.css
const css = fs.readFileSync(path.join(root, 'tokens/tokens.css'), 'utf8');
const block = sel => {
  const i = css.indexOf(sel + ' {');
  const body = css.slice(i, css.indexOf('\n}', i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
};
fs.writeFileSync(path.join(root, 'tokens/tokens.json'),
  JSON.stringify({ light: block(':root'), dark: block(':root[data-theme="dark"]') }, null, 2) + '\n');

const customCount = manifest.filter(m => m.source === 'custom').length;
console.log(`icons: ${manifest.length} (${customCount} custom, ${manifest.length - customCount} lucide)`);
