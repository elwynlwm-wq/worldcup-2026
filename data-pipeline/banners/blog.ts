// Per-article blog banner generator — reads each article's frontmatter
// (title/description/tags) and prompts a topic-appropriate 21:9 banner via
// fal.ai (nano-banana-pro). Reflects the POST's subject (not a team's colours).
//
// If an article is tagged with team slugs, those teams' identity is woven in.
//
// Output:
//   banners/out/blog/<slug>.png        full-res archive (gitignored → R2)
//   public/banners/blog/<slug>.jpg     web-ready (1280w JPG) the site serves
// FAL_KEY from .env.
//
// Style flags:
//   (default)       photoreal hero — full-bleed, seen whole
//   --backdrop      photoreal CARD BACKDROP — subject upper-right, lower-left dark
//                   for overlaid white text (the featured-story cards). Use this
//                   for banners that sit behind a headline.
//   --illustrated   bold illustrated-poster look instead of photoreal
//   --gpt           use openai/gpt-image-2 (cleaner crowds, no flares) vs nano-banana
//
// Usage:
//   npx tsx banners/blog.ts --backdrop --gpt              # all articles, card backdrops
//   npx tsx banners/blog.ts --backdrop --gpt welcome-to-world-cup-2026  # one slug
//   FORCE=1 ... to regenerate

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../lib/util';
import { TEAM_COLORS } from '../../src/data/teamColors';

const ARTICLES_DIR = join(ROOT, '..', 'src', 'content', 'articles');
const OUT_DIR = join(ROOT, 'banners', 'out', 'blog');
// Web-ready JPGs the site actually serves (the full-res PNG above is a gitignored
// archive). Downscaled + JPG since these are photoreal backdrops behind text.
const WEB_DIR = join(ROOT, '..', 'public', 'banners', 'blog');
const WEB_WIDTH = 1280;
const WEB_QUALITY = 82;

// nano-banana-pro takes aspect_ratio + returns { images:[{url}] }.
// gpt-image-2 takes image_size + returns base64 (or url) — handled below.
const MODELS = {
  nano: 'fal-ai/nano-banana-pro',
  gpt: 'openai/gpt-image-2', // OpenAI gpt-image on fal — cleaner, less pyro
} as const;

interface Article {
  slug: string;
  title: string;
  description: string;
  tags: string[];
}

// Minimal frontmatter parse (title/description/tags) — no YAML dep needed.
function parseFrontmatter(raw: string): Omit<Article, 'slug'> {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm = m ? m[1] : '';
  const str = (k: string) => {
    const r = fm.match(new RegExp(`^${k}:\\s*["']?(.*?)["']?\\s*$`, 'm'));
    return r ? r[1] : '';
  };
  const tagsLine = fm.match(/^tags:\s*\[(.*?)\]/m);
  const tags = tagsLine
    ? tagsLine[1].split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    : [];
  return { title: str('title'), description: str('description'), tags };
}

function loadArticles(only: string[]): Article[] {
  return readdirSync(ARTICLES_DIR)
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => ({ slug: f.replace(/\.mdx?$/, ''), ...parseFrontmatter(readFileSync(join(ARTICLES_DIR, f), 'utf8')) }))
    .filter((a) => only.length === 0 || only.includes(a.slug));
}

function buildPrompt(a: Article, illustrated: boolean, backdrop: boolean): string {
  // Teams referenced via tags (if any) → colour cue.
  const teamTags = a.tags.filter((t) => t in TEAM_COLORS);
  const colourCue = teamTags.length
    ? `Lead with the national colours of ${teamTags.join(' and ')}.`
    : `Use a rich, celebratory multi-colour World Cup palette (not tied to one nation).`;

  const style = illustrated
    ? [
        `Capture the MOOD and SUBJECT of this article as a bold, illustrated football scene — stadium atmosphere, energy, drama, the spirit of the 2026 World Cup across the USA, Canada and Mexico.`,
        colourCue,
        `Bold, modern, illustrated poster style — vibrant and premium, not a photograph.`,
      ]
    : [
        `Capture the MOOD and SUBJECT of this article as a cinematic, photorealistic football scene — real stadium atmosphere, natural golden-hour light, the spirit of the 2026 World Cup across the USA, Canada and Mexico.`,
        colourCue,
        `Photorealistic editorial sports photography — warm, premium, tasteful. A bright, joyful, family-friendly crowd. NO flares, NO smoke bombs, NO pyrotechnics, NO fire.`,
      ];

  // Backdrop mode: this image sits BEHIND a white headline overlaid in the
  // lower-left of a card. Keep the energy/subject in the upper-right; leave the
  // lower-left dark, calm and uncluttered so overlaid text stays legible. Works
  // across both a tall card and a wide card (it's deliberately not full-bleed-busy).
  const composition = backdrop
    ? [
        `Composition for use as a CARD BACKDROP behind a white headline: weight all the interest, light and subject toward the UPPER-RIGHT and right side.`,
        `Keep the LOWER-LEFT quadrant dark, calm, shadowed and almost empty — a quiet area where overlaid white text will sit. Overall darker and moodier than a hero, with deep shadows, so light text reads on top.`,
        `It must still look good cropped to either a wide strip or a taller portrait card, so do not rely on a single centred focal point.`,
      ]
    : [
        `Composition: full-bleed and atmospheric, no single central subject, balanced so it works as a wide hero behind a headline.`,
      ];

  return [
    `Create an exciting, ultrawide (21:9) cinematic editorial banner for a World Cup 2026 article.`,
    `Article title: "${a.title}". Subject: ${a.description}`,
    ...style,
    ...composition,
    `ABSOLUTELY NO text, letters, words, numbers, logos, sponsor marks, crests or flags anywhere in the image.`,
  ].join(' ');
}

interface Opts {
  model: (typeof MODELS)[keyof typeof MODELS];
  illustrated: boolean;
  backdrop: boolean;
  force: boolean;
}

// nano-banana wants aspect_ratio + gives {images:[{url}]}; gpt-image-2 wants
// image_size (a wide landscape) + may give a url or a base64 blob.
function requestBody(prompt: string, model: Opts['model']) {
  if (model === MODELS.gpt) {
    return { prompt, image_size: { width: 1536, height: 672 } }; // ~21:9 within gpt-image limits
  }
  return { prompt, aspect_ratio: '21:9' };
}

async function imageBytes(json: any): Promise<Buffer | null> {
  const img = json?.images?.[0];
  if (!img) return null;
  if (img.url) return Buffer.from(await (await fetch(img.url)).arrayBuffer());
  if (img.b64_json || img.data) return Buffer.from(img.b64_json ?? img.data, 'base64');
  return null;
}

async function generate(a: Article, o: Opts): Promise<'ok' | 'skip' | 'fail'> {
  const out = join(OUT_DIR, `${a.slug}.png`);
  if (!o.force && existsSync(out)) return 'skip';
  const key = process.env.FAL_KEY;
  if (!key) throw new Error('FAL_KEY missing — add it to data-pipeline/.env');

  const res = await fetch(`https://fal.run/${o.model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody(buildPrompt(a, o.illustrated, o.backdrop), o.model)),
  });
  if (!res.ok) { console.error(`  ✗ ${a.slug}: ${res.status} ${await res.text()}`); return 'fail'; }
  const bytes = await imageBytes(await res.json());
  if (!bytes) { console.error(`  ✗ ${a.slug}: no image in response`); return 'fail'; }
  writeFileSync(out, bytes); // full-res archive (gitignored)
  // Web-ready JPG the site serves.
  const web = join(WEB_DIR, `${a.slug}.jpg`);
  await sharp(bytes).resize(WEB_WIDTH).jpeg({ quality: WEB_QUALITY, mozjpeg: true }).toFile(web);
  console.log(`  ✓ ${a.slug}.png  →  public/banners/blog/${a.slug}.jpg`);
  return 'ok';
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(WEB_DIR, { recursive: true });
  const argv = process.argv.slice(2);
  const illustrated = argv.includes('--illustrated');
  const backdrop = argv.includes('--backdrop');
  const model = argv.includes('--gpt') ? MODELS.gpt : MODELS.nano;
  const slugs = argv.filter((a) => !a.startsWith('--'));
  const articles = loadArticles(slugs);
  const force = process.env.FORCE === '1';
  console.log(`Generating ${illustrated ? 'illustrated' : 'photoreal'}${backdrop ? ' backdrop' : ''} banners for ${articles.length} article(s) via ${model}…`);
  let ok = 0, skip = 0, fail = 0;
  for (const a of articles) {
    const r = await generate(a, { model, illustrated, backdrop, force });
    r === 'ok' ? ok++ : r === 'skip' ? skip++ : fail++;
  }
  console.log(`Done: ${ok} generated, ${skip} skipped, ${fail} failed. → ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
