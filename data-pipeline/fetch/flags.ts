// Copy the 48 WC team flags from the flag-icons package (MIT) into
// public/flags-country/, renamed to our team slugs (rect = <slug>.svg,
// square = <slug>-sq.svg). Run when flag-icons updates. Idempotent.
//
// flag-icons is a devDependency of the Astro app, so this reads from the app's
// node_modules. Run from the repo root or data-pipeline — paths are relative to
// the repo root.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/util';
import { TEAM_ISO } from '../../src/data/teamFlags';

const REPO = join(ROOT, '..');
const PKG = join(REPO, 'node_modules', 'flag-icons', 'flags');
const OUT = join(REPO, 'public', 'flags-country');

mkdirSync(OUT, { recursive: true });
let n = 0;
const missing: string[] = [];
for (const [slug, iso] of Object.entries(TEAM_ISO)) {
  const rect = join(PKG, '4x3', `${iso}.svg`);
  const sq = join(PKG, '1x1', `${iso}.svg`);
  if (existsSync(rect)) { copyFileSync(rect, join(OUT, `${slug}.svg`)); n++; } else missing.push(`${slug}(${iso}) rect`);
  if (existsSync(sq)) { copyFileSync(sq, join(OUT, `${slug}-sq.svg`)); n++; } else missing.push(`${slug}(${iso}) sq`);
}
console.log(`Copied ${n} flag files → ${OUT}`);
if (missing.length) console.log('Missing:', missing.join(', '));
