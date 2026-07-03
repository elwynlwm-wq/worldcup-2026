// Ingest one Instagram highlight reel into the site's media plane.
//
// A reel (e.g. from @leonrdewa, shared with permission) is: downloaded from
// Instagram, given a poster frame, uploaded to Cloudflare R2, and turned into
// a ready-to-paste <VideoReelCard> line. Videos live in R2 (post-media/), NOT
// the repo; only the small poster JPG lands in public/reels/ for LCP.
//
// This is a MANUAL, LOCAL task — deliberately NOT in CI. It needs a logged-in
// Instagram session (cookies), which must never sit on a shared runner, and it
// runs best from a residential IP (datacenter IPs get rate-limited/challenged).
//
// Requires on the machine that runs it:
//   - yt-dlp and ffmpeg on PATH
//   - an Instagram cookies file (Netscape format) — path in IG_COOKIES
//   - Cloudflare auth for R2 write: either `wrangler login`, or
//     CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID) with R2 Object R/W on the bucket
//
// Env (see .env.example):
//   IG_COOKIES        path to Netscape cookies.txt for a (burner) IG account
//   R2_BUCKET         R2 bucket name            (default: worldcup-2026)
//   R2_PREFIX         key prefix / folder       (default: post-media)
//   R2_PUBLIC_BASE    public base URL of bucket (default: the worldcup-2026 pub-*.r2.dev)
//
// Run:
//   npm run reel -- --slug france-sweden --url https://www.instagram.com/p/XXXX/
//   npm run reel -- --slug france-sweden --url <URL> --poster-at 3   # frame at 3s
//
// The <slug> is the article's reel slug (home-away), e.g. "france-sweden".

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, ensureDir } from '../lib/util';

const R2_BUCKET = process.env.R2_BUCKET || 'worldcup-2026';
const R2_PREFIX = process.env.R2_PREFIX || 'post-media';
const R2_PUBLIC_BASE =
  process.env.R2_PUBLIC_BASE || 'https://pub-53b6937ac1564b65a7bb62986f6253ce.r2.dev';

const POSTERS_DIR = join(ROOT, '..', 'public', 'reels'); // posters stay in-repo
const WRANGLER_CONFIG = join(ROOT, '..', 'wrangler.toml');

interface Args {
  slug: string;
  url: string;
  posterAt: number; // seconds into the clip for the poster frame
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { posterAt: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--slug') out.slug = argv[++i];
    else if (a === '--url') out.url = argv[++i];
    else if (a === '--poster-at') out.posterAt = Number(argv[++i]);
    else die(`Unknown argument: ${a}`);
  }
  if (!out.slug) die('Missing --slug (e.g. --slug france-sweden)');
  if (!out.url) die('Missing --url (the Instagram post/reel URL)');
  if (!/^[a-z0-9-]+$/.test(out.slug!)) die(`--slug must be kebab-case: got "${out.slug}"`);
  if (!Number.isFinite(out.posterAt) || out.posterAt! < 0) die('--poster-at must be a non-negative number of seconds');
  return out as Args;
}

function die(msg: string): never {
  console.error(`\n✘ ${msg}\n`);
  process.exit(1);
}

// Fail loudly if a required binary is missing, rather than a cryptic ENOENT.
// We check presence on PATH (not a --version call): version flags differ per
// tool (ffmpeg uses -version, and --version exits non-zero), so exit code is
// an unreliable "is it installed" signal.
function requireBinary(name: string): void {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'command', ['-v', name], {
      stdio: 'ignore',
      shell: process.platform !== 'win32', // `command` is a shell builtin
    });
  } catch {
    die(`"${name}" not found on PATH. Install it before running (this is a local task).`);
  }
}

function main() {
  const { slug, url, posterAt } = parseArgs(process.argv.slice(2));

  requireBinary('yt-dlp');
  requireBinary('ffmpeg');

  const cookies = process.env.IG_COOKIES;
  if (!cookies) die('IG_COOKIES is not set — path to the Instagram cookies.txt (Netscape format).');
  if (!existsSync(cookies)) die(`IG_COOKIES points at a missing file: ${cookies}`);

  ensureDir(POSTERS_DIR);
  const work = mkdtempSync(join(tmpdir(), `reel-${slug}-`));
  const mp4 = join(work, `${slug}.mp4`);
  const posterTmp = join(work, `${slug}.jpg`);
  const posterFinal = join(POSTERS_DIR, `${slug}.jpg`);
  const key = `${R2_PREFIX}/${slug}.mp4`;
  const publicUrl = `${R2_PUBLIC_BASE}/${key}`;

  try {
    // 1. Download the reel with the authenticated session.
    console.log(`↓ Downloading ${url}`);
    execFileSync(
      'yt-dlp',
      ['--cookies', cookies, '--no-playlist', '-f', 'mp4/best', '-o', mp4, url],
      { stdio: 'inherit' },
    );
    if (!existsSync(mp4)) die('yt-dlp finished but no MP4 was produced (auth/rate-limit? check the output above).');

    // 2. Poster frame (in-repo, for LCP). One frame at --poster-at seconds.
    console.log(`▷ Extracting poster at ${posterAt}s`);
    execFileSync(
      'ffmpeg',
      ['-y', '-ss', String(posterAt), '-i', mp4, '-frames:v', '1', '-q:v', '2', posterTmp],
      { stdio: 'inherit' },
    );
    if (!existsSync(posterTmp)) die('ffmpeg did not produce a poster frame.');
    copyFileSync(posterTmp, posterFinal);

    // 3. Upload the video to R2. --remote = the real bucket, not local.
    console.log(`☁ Uploading video → r2://${R2_BUCKET}/${key}`);
    execFileSync(
      'npx',
      [
        'wrangler', 'r2', 'object', 'put', `${R2_BUCKET}/${key}`,
        '--file', mp4, '--content-type', 'video/mp4', '--remote',
        `--config=${WRANGLER_CONFIG}`,
      ],
      { stdio: 'inherit', cwd: ROOT },
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  // 4. The card to paste into the postmatch MDX (writer stays in control of prose).
  console.log('\n✓ Done. Poster committed to public/reels/, video on R2.');
  console.log('\nPaste this into the article (and import VideoReelCard if not already):\n');
  console.log(`import VideoReelCard from '../../components/VideoReelCard.astro';`);
  console.log(
    `<VideoReelCard src="${publicUrl}" poster="/reels/${slug}.jpg" note="Animated highlights via @leonrdewa" />\n`,
  );
}

main();
