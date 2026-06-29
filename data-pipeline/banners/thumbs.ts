// Derived banner crops — the full team banners are ~1.7MB each at 1584×672.
// We close-crop them (zoom into the busy centre band so the art reads as
// energetic rather than sharp-but-empty when shrunk) at two sizes:
//
//   thumbs/<id>.webp  (480×200)   — Teams listing cards + the compact matchup band
//   heroes/<id>.webp  (full-res)  — the A-vs-B hero (MatchupGraphic), where each
//                                   team only shows as a diagonal HALF and needs
//                                   every pixel. Full 1:1 dimensions, just compressed
//                                   to WebP (no crop) so it stays crisp but light.
//
// Source:  public/banners/<id>.png   (full-res, also used on the team hero page)
//
// Run: `npm run banners:thumbs` (re-run when banners are regenerated). Idempotent;
// FORCE=1 to overwrite existing crops.

import { readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../lib/util';

const REPO = join(ROOT, '..');
const SRC_DIR = join(REPO, 'public', 'banners');

const CROP_W = 0.72; // keep centre 72% width …
const CROP_H = 0.78; // … and centre 78% height (zoom into the action)

// Each tier: output dir + webp quality. `full` keeps the source at 1:1 (no crop,
// no resize) and only compresses; otherwise close-crop + resize to w×h.
const TIERS = [
  { dir: 'thumbs', w: 480, h: 200, quality: 72, full: false },
  { dir: 'heroes', quality: 82, full: true },
] as const;

async function makeCrop(srcPath: string, outPath: string, tier: (typeof TIERS)[number]): Promise<void> {
  if (tier.full) {
    // 1:1 — every pixel of the original, just WebP-compressed.
    await sharp(srcPath).webp({ quality: tier.quality }).toFile(outPath);
    return;
  }
  const { width: W = 0, height: H = 0 } = await sharp(srcPath).metadata();
  const cw = Math.round(W * CROP_W);
  const ch = Math.round(H * CROP_H);
  await sharp(srcPath)
    .extract({ left: Math.round((W - cw) / 2), top: Math.round((H - ch) / 2), width: cw, height: ch })
    .resize(tier.w, tier.h, { fit: 'cover' })
    .webp({ quality: tier.quality })
    .toFile(outPath);
}

async function main() {
  const force = process.env.FORCE === '1';
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  for (const t of TIERS) mkdirSync(join(SRC_DIR, t.dir), { recursive: true });

  const files = readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.png'))
    .filter((f) => only.length === 0 || only.includes(f.replace(/\.png$/, '')));

  for (const tier of TIERS) {
    const outDir = join(SRC_DIR, tier.dir);
    console.log(`Building ${files.length} ${tier.dir} (${tier.full ? 'full-res' : `${tier.w}×${tier.h}`}) → ${outDir}`);
    let ok = 0, skip = 0, fail = 0, bytes = 0;
    for (const f of files) {
      const src = join(SRC_DIR, f);
      const out = join(outDir, f.replace(/\.png$/, '.webp'));
      if (!force && existsSync(out)) { skip++; continue; }
      try {
        await makeCrop(src, out, tier);
        ok++; bytes += statSync(out).size;
      } catch (e) {
        console.error(`  ✗ ${f}: ${(e as Error).message}`); fail++;
      }
    }
    console.log(`  Done: ${ok} built, ${skip} skipped, ${fail} failed. Avg ${ok ? (bytes / ok / 1024).toFixed(0) : 0}KB.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
