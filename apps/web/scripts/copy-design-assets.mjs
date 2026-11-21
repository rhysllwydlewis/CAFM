// Copies the icon sprite from the design source of truth into public/.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const design = resolve(here, '../../../design');
const pub = resolve(here, '../public');
mkdirSync(pub, { recursive: true });
copyFileSync(resolve(design, 'icons/sprite.svg'), resolve(pub, 'icons.svg'));
copyFileSync(resolve(design, 'icons/logo/logomark.svg'), resolve(pub, 'favicon.svg'));
