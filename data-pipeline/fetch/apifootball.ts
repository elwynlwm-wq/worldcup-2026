// API-Football (api-sports.io) fetcher — PAID (Pro) source for fresh WC2026
// fixtures/results/statuses and player photos.
//
// IMPORTANT: API-Football's ToS grants no publication license (tier-independent).
// We use it as the live source pre-launch by the tech lead's call; before public
// launch, verify publish rights or swap to a license-clean source behind the
// provider seam. See data-pipeline/SOURCING.md.
//
// Key read from data-pipeline/.env (API_FOOTBALL_KEY), loaded by lib/util.

import { fetchCached } from '../lib/util';

const BASE = 'https://v3.football.api-sports.io';
const WC_LEAGUE = 1;
const WC_SEASON = 2026;

function key(): string {
  const k = process.env.API_FOOTBALL_KEY;
  if (!k) throw new Error('API_FOOTBALL_KEY missing — add it to data-pipeline/.env');
  return k;
}

// Cached GET against the API (caches raw JSON under sources/ for reproducible builds).
async function afGet(path: string, cacheName: string, opts: { force?: boolean } = {}): Promise<any> {
  const url = `${BASE}${path}`;
  // fetchCached only does plain fetch; API-Football needs an auth header, so we
  // do a header-aware variant here but reuse the same on-disk cache convention.
  const { existsSync, readFileSync, writeFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { SOURCES_DIR, ensureDir } = await import('../lib/util');
  ensureDir(SOURCES_DIR);
  const path_ = join(SOURCES_DIR, cacheName);
  if (!opts.force && existsSync(path_)) {
    const ageH = (Date.now() - statSync(path_).mtimeMs) / 3.6e6;
    console.log(`  ✓ cache hit ${cacheName} (${ageH.toFixed(1)}h old)`);
    return JSON.parse(readFileSync(path_, 'utf8'));
  }
  console.log(`  ↓ AF ${path}`);
  const res = await fetch(url, { headers: { 'x-apisports-key': key() } });
  if (!res.ok) throw new Error(`API-Football ${res.status} for ${path}`);
  const json = await res.json();
  writeFileSync(path_, JSON.stringify(json));
  return json;
}

export interface AfFixture {
  id: number;
  date: string;
  statusShort: string; // FT | NS | 1H | HT | LIVE | ...
  statusLong: string;
  elapsed: number | null;
  round: string;
  venue: string | null;
  city: string | null;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
}

export async function fetchAfFixtures(opts: { force?: boolean } = {}): Promise<AfFixture[]> {
  const j = await afGet(
    `/fixtures?league=${WC_LEAGUE}&season=${WC_SEASON}`,
    'apifootball-fixtures-2026.json',
    opts,
  );
  return (j.response || []).map((f: any) => ({
    id: f.fixture.id,
    date: f.fixture.date,
    statusShort: f.fixture.status.short,
    statusLong: f.fixture.status.long,
    elapsed: f.fixture.status.elapsed ?? null,
    round: f.league.round,
    venue: f.fixture.venue?.name ?? null,
    city: f.fixture.venue?.city ?? null,
    homeName: f.teams.home.name,
    awayName: f.teams.away.name,
    homeScore: f.goals.home,
    awayScore: f.goals.away,
  }));
}

export interface AfTeam {
  id: number;
  name: string;
}

export async function fetchAfTeams(opts: { force?: boolean } = {}): Promise<AfTeam[]> {
  const j = await afGet(
    `/teams?league=${WC_LEAGUE}&season=${WC_SEASON}`,
    'apifootball-teams-2026.json',
    opts,
  );
  return (j.response || []).map((t: any) => ({ id: t.team.id, name: t.team.name }));
}

export interface AfPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string | null;
  photo: string | null;
}

/** One squad (26 players w/ photos) per team — one API call each. */
export async function fetchAfSquad(teamId: number, opts: { force?: boolean } = {}): Promise<AfPlayer[]> {
  const j = await afGet(`/players/squads?team=${teamId}`, `apifootball-squad-${teamId}.json`, opts);
  const sq = (j.response || [])[0];
  return (sq?.players || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    number: p.number ?? null,
    position: p.position ?? null,
    photo: p.photo ?? null,
  }));
}
