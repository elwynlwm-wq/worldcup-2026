// Team & matchup banner generator — warehouse facts → prompt → fal.ai
// (nano-banana-pro) → image. Nano Banana web-searches each team's real 2026 kit.
//
// Two STYLES (intensity scales with where the banner lives):
//   muted  — restrained, recedes behind page content (team-page headers). DEFAULT.
//   hero   — vibrant/explosive (standalone story heroes).
// Two MODES:
//   team   — single team (default)
//   match  — Team A vs Team B (match / Showdown headers)
//
// Output (gitignored, → R2 when wired to site):
//   banners/out/<style>/<team>.png
//   banners/out/<style>/match-<a>-<b>.png
//
// Usage:
//   npx tsx banners/generate.ts                         # all 48, muted
//   npx tsx banners/generate.ts --style hero brazil     # one team, hero
//   npx tsx banners/generate.ts --match south-africa canada   # matchup
//   FORCE=1 ... to regenerate existing
//
// FAL_KEY from .env.

import Database from 'better-sqlite3';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WAREHOUSE_DIR, ROOT, ensureDir } from '../lib/util';

const DB_PATH = join(WAREHOUSE_DIR, 'warehouse.db');
const MODEL = 'fal-ai/nano-banana-pro';

type Style = 'muted' | 'hero';

interface TeamHook {
  id: string;
  name: string;
  confederation: string;
  groupLetter: string;
  status: string;
  powerRank: number;
  topPlayer: string | null;
}

function getHook(db: Database.Database, id: string): TeamHook | null {
  const t = db
    .prepare(
      `SELECT id,name,confederation,group_letter AS groupLetter,status,
              (SELECT count(*)+1 FROM team t2 WHERE t2.elo > t.elo) AS powerRank
       FROM team t WHERE id=?`,
    )
    .get(id) as Omit<TeamHook, 'topPlayer'> | undefined;
  if (!t) return null;
  const top = db
    .prepare(
      `SELECT player_name AS name FROM af_player_stat WHERE team_id=? AND rating IS NOT NULL AND minutes>0
       GROUP BY player_id ORDER BY avg(CAST(rating AS REAL)) DESC LIMIT 1`,
    )
    .get(id) as { name: string } | undefined;
  return { ...t, topPlayer: top?.name ?? null };
}

function allTeamIds(db: Database.Database): string[] {
  return (db.prepare(`SELECT id FROM team ORDER BY elo DESC`).all() as { id: string }[]).map((r) => r.id);
}

const statusLine = (s: string) =>
  s === 'winner' ? 'group winners' :
  s === 'runner_up' ? 'into the knockouts' :
  s === 'best_third' ? 'through as a best third-placed team' :
  s === 'eliminated' ? 'out at the group stage' : 'fighting for a knockout place';

// Hardened no-text/no-logo rule (these models love adding text — state it forcefully).
const NO_TEXT =
  'ABSOLUTELY NO text, letters, words, numbers, captions, watermarks or typography of any kind anywhere in the image. ' +
  'No brand or sponsor logos, no kit manufacturer marks, no federation crests, no flags.';

const KIT_RULE =
  "Web-search the team's ACTUAL 2026 national team home kit and use its real colours and pattern, rendered as a plain unbranded kit.";

// Cropability: full-bleed, evenly distributed, NO single center of focus, so any
// crop (incl. a 7:1 slice) still reads well.
const CROPABLE =
  'Composition: a full-bleed, edge-to-edge wash of energy with NO single central subject or focal point — ' +
  'distribute the colour, motion and atmosphere evenly across the entire ultrawide frame so the image can be cropped to any region and still look balanced and dynamic.';

function teamPrompt(t: TeamHook, _style: Style): string {
  return [
    `Ultrawide (21:9) vibrant, exciting, abstract football banner in the colours of ${t.name}'s national team.`,
    `Saturated ${t.name} team colours with dynamic energy swirls, light streaks, motion, sparks and roaring stadium atmosphere.`,
    KIT_RULE,
    `Generic, anonymous footballers may appear as small distributed silhouettes/motion across the frame, but NO named or recognizable individual and NO single hero figure.`,
    CROPABLE,
    `Bold, modern, illustrated poster style — energetic and premium, not a photograph.`,
    NO_TEXT,
  ].join(' ');
}

function matchPrompt(a: TeamHook, b: TeamHook, _style: Style): string {
  return [
    `Ultrawide (21:9) vibrant, exciting football matchup banner: ${a.name} versus ${b.name} at the FIFA World Cup 2026.`,
    `Split composition — ${a.name}'s colours on the left, ${b.name}'s colours on the right, energy meeting and clashing in the middle.`,
    `${KIT_RULE} Generic anonymous players in each side's correct 2026 kit colours may appear, but NO named/recognizable individuals.`,
    `Saturated colours, dynamic energy, motion and stadium atmosphere on both halves.`,
    `Bold, modern, illustrated poster style — not a photograph.`,
    NO_TEXT,
  ].join(' ');
}

async function callFal(prompt: string, outPath: string, force: boolean): Promise<'ok' | 'skip' | 'fail'> {
  if (!force && existsSync(outPath)) return 'skip';
  const key = process.env.FAL_KEY;
  if (!key) throw new Error('FAL_KEY missing — add it to data-pipeline/.env');
  const res = await fetch(`https://fal.run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspect_ratio: '21:9' }),
  });
  if (!res.ok) {
    console.error(`  ✗ ${res.status} ${await res.text()}`);
    return 'fail';
  }
  const json = (await res.json()) as { images?: { url: string }[] };
  const url = json.images?.[0]?.url;
  if (!url) return 'fail';
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(outPath, buf);
  console.log(`  ✓ ${outPath.split('/').slice(-2).join('/')} (${(buf.length / 1024).toFixed(0)}kb)`);
  return 'ok';
}

async function main() {
  const args = process.argv.slice(2);
  const force = process.env.FORCE === '1';
  let style: Style = 'hero';
  const si = args.indexOf('--style');
  if (si >= 0) {
    style = args[si + 1] as Style;
    args.splice(si, 2);
  }
  const isMatch = args[0] === '--match';
  if (isMatch) args.shift();

  const db = new Database(DB_PATH, { readonly: true });
  const outDir = join(ROOT, 'banners', 'out', style);
  ensureDir(outDir);

  if (isMatch) {
    const [aId, bId] = args;
    const a = getHook(db, aId);
    const b = getHook(db, bId);
    if (!a || !b) throw new Error(`unknown team(s): ${aId}, ${bId}`);
    console.log(`Matchup banner (${style}): ${a.name} vs ${b.name}…`);
    await callFal(matchPrompt(a, b, style), join(outDir, `match-${aId}-${bId}.png`), force);
  } else {
    const ids = args.length ? args : allTeamIds(db);
    console.log(`Generating ${ids.length} team banner(s) (${style}) via ${MODEL}…`);
    let ok = 0, skip = 0, fail = 0;
    for (const id of ids) {
      const t = getHook(db, id);
      if (!t) { console.error(`  ? unknown team ${id}`); fail++; continue; }
      const r = await callFal(teamPrompt(t, style), join(outDir, `${id}.png`), force);
      r === 'ok' ? ok++ : r === 'skip' ? skip++ : fail++;
    }
    console.log(`Done: ${ok} generated, ${skip} skipped, ${fail} failed. → ${outDir}`);
  }
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
