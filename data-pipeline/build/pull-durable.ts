// Pull the DURABLE stores back from remote D1 at the START of a pipeline run.
//
// We no longer git-commit the warehouse/*.json snapshot stores, so their only
// persistent home is Cloudflare D1 (published every run by publish-d1.ts). This
// script runs BEFORE build:warehouse/export and reconstructs the JSON stores
// those steps expect to read, from the remote D1 tables:
//
//   af_odds_history  → odds-history.json   (read by build/index.ts)
//   vote_snapshot    → vote-snapshots.json (read by build/export.ts)
//   odds_snapshot    → odds-snapshots.json (read by build/export.ts)
//
// Flow across a run: pull (here) → build merges any NEW captures → publish pushes
// the merged set back to D1. So D1 is the persistent home; the JSON is a per-run
// scratch reconstruction. It MUST emit the exact shape build/index.ts and
// build/export.ts read (see those files), or accumulated freezes are lost.
//
// Guard: if the remote read fails (auth, network) or the table is empty (first
// ever run, or D1 not yet seeded) we emit an EMPTY store and continue — never
// crash the pipeline. Uses CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN from env
// (set in CI), same as publish-d1.ts.
// Run: npm run pull:durable   (before build:warehouse)

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, WAREHOUSE_DIR, ensureDir } from '../lib/util';

const D1_NAME = process.env.D1_NAME || 'worldcup-site';
const CONFIG = join(ROOT, '..', 'wrangler.toml');

const ODDS_HIST_PATH = join(WAREHOUSE_DIR, 'odds-history.json');
const SNAPSHOT_PATH = join(WAREHOUSE_DIR, 'vote-snapshots.json');
const ODDS_SNAPSHOT_PATH = join(WAREHOUSE_DIR, 'odds-snapshots.json');

// Run one SELECT against remote D1 and return its rows. `wrangler d1 execute
// --json` prints an array of result objects; we take the first's `.results`.
// Returns [] on ANY failure so callers can fall back to an empty store.
function query(sql: string): Record<string, any>[] {
  try {
    const out = execFileSync(
      'npx',
      ['wrangler', 'd1', 'execute', D1_NAME, '--remote', '--json', `--command=${sql}`, `--config=${CONFIG}`],
      // maxBuffer: af_odds_history is tens of thousands of rows — the default 1MB
      // overflows with ENOBUFS. 256MB is ample headroom for the full history.
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 256 * 1024 * 1024 },
    );
    const parsed = JSON.parse(out);
    // Shape: [{ results: [...], success: true, meta: {...} }]
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    const rows = first?.results;
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn(`  ! pull-durable: query failed, using empty store — ${(e as Error).message.split('\n')[0]}`);
    return [];
  }
}

function main() {
  ensureDir(WAREHOUSE_DIR);

  // --- odds-history.json: flat array of hourly odds snapshots per fixture.
  // Shape read by build/index.ts (OddsHistRow[]): fixture_id, bookmaker,
  // home_odd, draw_odd, away_odd, snapshot_ts.
  const histRows = query(
    `SELECT fixture_id, bookmaker, home_odd, draw_odd, away_odd, snapshot_ts FROM af_odds_history`,
  );
  const history = histRows.map((r) => ({
    fixture_id: r.fixture_id,
    bookmaker: r.bookmaker,
    home_odd: r.home_odd,
    draw_odd: r.draw_odd,
    away_odd: r.away_odd,
    snapshot_ts: r.snapshot_ts,
  }));
  writeFileSync(ODDS_HIST_PATH, JSON.stringify(history));
  console.log(`  ✓ odds-history.json (${history.length} rows)`);

  // --- vote-snapshots.json: keyed by pair → VoteSnap.
  // Shape read by build/export.ts: { home, draw, away, homeId, awayId, frozenAt }.
  const voteRows = query(
    `SELECT pair_key, home_id, away_id, vote_home, vote_draw, vote_away, frozen_at FROM vote_snapshot`,
  );
  const votes: Record<string, any> = {};
  for (const r of voteRows) {
    votes[r.pair_key] = {
      home: r.vote_home, draw: r.vote_draw, away: r.vote_away,
      homeId: r.home_id, awayId: r.away_id, frozenAt: r.frozen_at,
    };
  }
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(votes, null, 0));
  console.log(`  ✓ vote-snapshots.json (${Object.keys(votes).length} pairs)`);

  // --- odds-snapshots.json: keyed by pair → OddsSnap (many books per pair).
  // Shape read by build/export.ts: { homeId, awayId, startTs, books[], frozenAt }.
  // startTs isn't stored in D1 (the freeze already happened, so it's no longer
  // needed to re-decide freezing); null is safe — export.ts only re-checks it
  // for NOT-yet-frozen pairs, and these are all frozen.
  const oddsRows = query(
    `SELECT pair_key, home_id, away_id, bookmaker, home_odd, draw_odd, away_odd, frozen_at FROM odds_snapshot`,
  );
  const oddsSnaps: Record<string, any> = {};
  for (const r of oddsRows) {
    const e = (oddsSnaps[r.pair_key] ??= {
      homeId: r.home_id, awayId: r.away_id, startTs: null, books: [], frozenAt: r.frozen_at,
    });
    e.books.push({ bookmaker: r.bookmaker, home: r.home_odd, draw: r.draw_odd, away: r.away_odd });
  }
  writeFileSync(ODDS_SNAPSHOT_PATH, JSON.stringify(oddsSnaps, null, 0));
  console.log(`  ✓ odds-snapshots.json (${Object.keys(oddsSnaps).length} pairs)`);
}

main();
