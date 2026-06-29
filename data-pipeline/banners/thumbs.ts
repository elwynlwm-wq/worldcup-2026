// Listing thumbnails — the full team banners are ~1.7MB each at 1584×672, far
// too heavy for the Teams listing (48 cards) which only shows a small faded
// strip. This downscales + close-crops each banner into a light WebP thumb.
//
// Close-crop zooms into the busy centre band so the art reads as energetic at
// card size (rather than sharp-but-empty when a wide image is shrunk).
//
// Source:  public/banners/<id>.png        (full-res, used on the team hero page)
// Output:  public/banners/thumbs/<id>.webp (used in the Teams listing cards)
//
// Run: `npm run banners:thumbs` (re-run when banners are regenerated). Idempotent;
// FORCE=1 to overwrite existing thumbs.

import { readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../lib/util';

const REPO = join(ROOT, '..');
const SRC_DIR = join(REPO, 'public', 'banners');
const OUT_DIR = join(SRC_DIR, 'thumbs');

const THUMB_W = 480;
const THUMB_H = 200;
const CROP_W = 0.72; // keep centre 72% width …
const CROP_H = 0.78; // … and centre 78% height (zoom into the action)
const QUALITY = 72;

async function makeThumb(file: string, force: boolean): Promise<'ok' | 'skip' | 'fail'> {
  const src = join(SRC_DIR, file);
  const out = join(OUT_DIR, file.replace(/\.png$/, '.webp'));
  if (!force && existsSync(out)) return 'skip';
  try {
    const { width: W = 0, height: H = 0 } = await sharp(src).metadata();
    const cw = Math.round(W * CROP_W);
    const ch = Math.round(H * CROP_H);
    await sharp(src)
      .extract({ left: Math.round((W - cw) / 2), top: Math.round((H - ch) / 2), width: cw, height: ch })
      .resize(THUMB_W, THUMB_H, { fit: 'cover' })
      .webp({ quality: QUALITY })
      .toFile(out);
    return 'ok';
  } catch (e) {
    console.error(`  ✗ ${file}: ${(e as Error).message}`);
    return 'fail';
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const force = process.env.FORCE === '1';
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const files = readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.png'))
    .filter((f) => only.length === 0 || only.includes(f.replace(/\.png$/, '')));

  console.log(`Building ${files.length} listing thumb(s) → ${OUT_DIR}`);
  let ok = 0, skip = 0, fail = 0, bytes = 0;
  for (const f of files) {
    const r = await makeThumb(f, force);
    r === 'ok' ? ok++ : r === 'skip' ? skip++ : fail++;
    if (r === 'ok') bytes += statSync(join(OUT_DIR, f.replace(/\.png$/, '.webp'))).size;
  }
  console.log(`Done: ${ok} built, ${skip} skipped, ${fail} failed. Avg ${ok ? (bytes / ok / 1024).toFixed(0) : 0}KB/thumb.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
