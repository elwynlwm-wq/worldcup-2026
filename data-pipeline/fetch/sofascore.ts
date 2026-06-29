// SofaScore fetcher (via RapidAPI apidojo) — DEV SOURCE ONLY.
//
// ⚠️ This is scraped/resold third-party data. Great for the predicted signals
// nothing else gives us (who-will-win fan votes + PREDICTED lineups), but it is
// NOT licensed for publishing. Use to build/prototype features behind the
// provider seam; swap to derived/licensed data before public launch. Lands in
// ss_* tables (own namespace) so it's cross-checkable and trivially removable.
// See SOURCING.md. RAPIDAPI_KEY from .env (rotate before deploy).

import { fetchCached } from '../lib/util';

const HOST = 'sofascore.p.rapidapi.com';
const WC_TOURNAMENT = 16; // SofaScore "World Championship" = men's World Cup
const WC_SEASON = 58210; // 2026

function key(): string {
  const k = process.env.RAPIDAPI_KEY;
  if (!k) throw new Error('RAPIDAPI_KEY missing — add it to data-pipeline/.env');
  return k;
}

async function ssGet(path: string, cacheName: string, opts: { force?: boolean; quiet?: boolean } = {}): Promise<any> {
  const { existsSync, readFileSync, writeFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { SOURCES_DIR, ensureDir } = await import('../lib/util');
  ensureDir(SOURCES_DIR);
  const file = join(SOURCES_DIR, cacheName);
  if (!opts.force && existsSync(file)) {
    if (!opts.quiet) console.log(`  ✓ cache hit ${cacheName} (${((Date.now() - statSync(file).mtimeMs) / 3.6e6).toFixed(1)}h)`);
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  if (!opts.quiet) console.log(`  ↓ SS ${path}`);
  const res = await fetch(`https://${HOST}/${path}`, {
    headers: { 'X-RapidAPI-Key': key(), 'X-RapidAPI-Host': HOST },
  });
  if (!res.ok) throw new Error(`SofaScore ${res.status} for ${path}`);
  const json = await res.json();
  writeFileSync(file, JSON.stringify(json));
  return json;
}

export interface SsMatch {
  id: number;
  homeName: string;
  awayName: string;
  startTimestamp: number;
  status: string; // notstarted | finished | inprogress
}

/** All WC2026 matches (paginates last + next). */
export async function fetchSsMatches(opts: { force?: boolean } = {}): Promise<SsMatch[]> {
  const out: SsMatch[] = [];
  for (const kind of ['last', 'next'] as const) {
    for (let page = 0; page < 10; page++) {
      const j = await ssGet(
        `tournaments/get-${kind}-matches?tournamentId=${WC_TOURNAMENT}&seasonId=${WC_SEASON}&pageIndex=${page}`,
        `sofascore-${kind}-${page}.json`,
        opts,
      );
      for (const e of j.events || [])
        out.push({
          id: e.id,
          homeName: e.homeTeam?.name ?? '',
          awayName: e.awayTeam?.name ?? '',
          startTimestamp: e.startTimestamp ?? 0,
          status: e.status?.type ?? '',
        });
      if (!j.hasNextPage) break;
    }
  }
  // de-dupe by id
  return [...new Map(out.map((m) => [m.id, m])).values()];
}

export interface SsVote {
  matchId: number;
  vote1: number; // home win
  voteX: number; // draw
  vote2: number; // away win
}

export async function fetchSsVotes(matchId: number): Promise<SsVote | null> {
  const j = await ssGet(`matches/get-votes?matchId=${matchId}`, `sofascore-votes-${matchId}.json`, { quiet: true });
  const v = j.vote;
  if (!v) return null;
  return { matchId, vote1: v.vote1 ?? 0, voteX: v.voteX ?? 0, vote2: v.vote2 ?? 0 };
}

export interface SsLineupPlayer {
  name: string;
  position: string | null;
  jersey: string | null;
  substitute: boolean;
  rating: number | null;
}
export interface SsLineup {
  matchId: number;
  confirmed: boolean; // false = PREDICTED XI (what we want pre-match)
  homeFormation: string | null;
  awayFormation: string | null;
  home: SsLineupPlayer[];
  away: SsLineupPlayer[];
}

export async function fetchSsLineup(matchId: number): Promise<SsLineup | null> {
  const j = await ssGet(`matches/get-lineups?matchId=${matchId}`, `sofascore-lineup-${matchId}.json`, { quiet: true });
  if (!j.home && !j.away) return null;
  const map = (arr: any[]): SsLineupPlayer[] =>
    (arr || []).map((p) => ({
      name: p.player?.name ?? '',
      position: p.position ?? p.player?.position ?? null,
      jersey: p.jerseyNumber ?? p.shirtNumber ?? null,
      substitute: !!p.substitute,
      rating: p.avgRating ?? null,
    }));
  return {
    matchId,
    confirmed: !!j.confirmed,
    homeFormation: j.home?.formation ?? null,
    awayFormation: j.away?.formation ?? null,
    home: map(j.home?.players),
    away: map(j.away?.players),
  };
}
