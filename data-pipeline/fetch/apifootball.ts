// API-Football (api-sports.io) fetcher — PAID (Pro) source for fresh WC2026
// fixtures/results/statuses and player photos.
//
// IMPORTANT: API-Football's ToS grants no publication license (tier-independent).
// We use it as the live source pre-launch by the tech lead's call; before public
// launch, verify publish rights or swap to a license-clean source behind the
// provider seam. See data-pipeline/SOURCING.md.
//
// Key read from data-pipeline/.env (API_FOOTBALL_KEY), loaded by lib/util.

import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES_DIR, ensureDir } from '../lib/util';

const BASE = 'https://v3.football.api-sports.io';
const WC_LEAGUE = 1;
const WC_SEASON = 2026;

function key(): string {
  const k = process.env.API_FOOTBALL_KEY;
  if (!k) throw new Error('API_FOOTBALL_KEY missing — add it to data-pipeline/.env');
  return k;
}

// Cached GET against the API (caches raw JSON under sources/ for reproducible builds).
// quiet=true suppresses per-call logging for the many per-fixture calls.
async function afGet(
  path: string,
  cacheName: string,
  opts: { force?: boolean; quiet?: boolean } = {},
): Promise<any> {
  ensureDir(SOURCES_DIR);
  const file = join(SOURCES_DIR, cacheName);
  if (!opts.force && existsSync(file)) {
    if (!opts.quiet) {
      const ageH = (Date.now() - statSync(file).mtimeMs) / 3.6e6;
      console.log(`  ✓ cache hit ${cacheName} (${ageH.toFixed(1)}h old)`);
    }
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  if (!opts.quiet) console.log(`  ↓ AF ${path}`);
  // Retry on rate-limit / transient 5xx with backoff (honours Retry-After).
  // The cold-start run (empty sources/ cache) fetches detail for every finished
  // fixture in a burst, which can trip 429; backing off lets it drain instead of
  // crashing the whole pipeline. Warm runs only fetch new matches, so rarely hit this.
  const MAX_TRIES = 5;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { 'x-apisports-key': key() } });
    if (res.ok) {
      const json = await res.json();
      writeFileSync(file, JSON.stringify(json));
      return json;
    }
    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt >= MAX_TRIES) {
      throw new Error(`API-Football ${res.status} for ${path}${attempt > 1 ? ` (after ${attempt} tries)` : ''}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** (attempt - 1), 30000);
    if (!opts.quiet) console.log(`  … AF ${res.status}, retry ${attempt}/${MAX_TRIES} in ${Math.round(waitMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
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

// --- Standings (group tables) ------------------------------------------------
export interface AfStanding {
  group: string;
  rank: number;
  teamId: number;
  teamName: string;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: string | null;
}

export async function fetchAfStandings(opts: { force?: boolean } = {}): Promise<AfStanding[]> {
  const j = await afGet(
    `/standings?league=${WC_LEAGUE}&season=${WC_SEASON}`,
    'apifootball-standings-2026.json',
    opts,
  );
  const groups = j.response?.[0]?.league?.standings || [];
  const out: AfStanding[] = [];
  for (const group of groups) {
    for (const row of group) {
      out.push({
        group: row.group,
        rank: row.rank,
        teamId: row.team.id,
        teamName: row.team.name,
        played: row.all.played,
        win: row.all.win,
        draw: row.all.draw,
        lose: row.all.lose,
        goalsFor: row.all.goals.for,
        goalsAgainst: row.all.goals.against,
        points: row.points,
        form: row.form ?? null,
      });
    }
  }
  return out;
}

// --- Per-fixture: team stats / events / lineups / player stats ---------------
export interface AfTeamStat {
  fixtureId: number;
  teamId: number;
  stats: Record<string, number | string | null>; // type → value
}

export async function fetchAfFixtureStats(fixtureId: number): Promise<AfTeamStat[]> {
  const j = await afGet(`/fixtures/statistics?fixture=${fixtureId}`, `apifootball-stats-${fixtureId}.json`, { quiet: true });
  return (j.response || []).map((t: any) => ({
    fixtureId,
    teamId: t.team.id,
    stats: Object.fromEntries((t.statistics || []).map((s: any) => [s.type, s.value])),
  }));
}

export interface AfEvent {
  fixtureId: number;
  minute: number | null;
  extra: number | null;
  teamId: number | null;
  playerId: number | null;
  playerName: string | null;
  assistName: string | null;
  type: string;
  detail: string;
}

export async function fetchAfFixtureEvents(fixtureId: number): Promise<AfEvent[]> {
  const j = await afGet(`/fixtures/events?fixture=${fixtureId}`, `apifootball-events-${fixtureId}.json`, { quiet: true });
  return (j.response || []).map((e: any) => ({
    fixtureId,
    minute: e.time?.elapsed ?? null,
    extra: e.time?.extra ?? null,
    teamId: e.team?.id ?? null,
    playerId: e.player?.id ?? null,
    playerName: e.player?.name ?? null,
    assistName: e.assist?.name ?? null,
    type: e.type,
    detail: e.detail,
  }));
}

export interface AfLineup {
  fixtureId: number;
  teamId: number;
  formation: string | null;
  coach: string | null;
  startXI: { id: number; name: string; number: number | null; pos: string | null; grid: string | null }[];
  subs: { id: number; name: string; number: number | null; pos: string | null }[];
}

export async function fetchAfFixtureLineups(fixtureId: number): Promise<AfLineup[]> {
  const j = await afGet(`/fixtures/lineups?fixture=${fixtureId}`, `apifootball-lineups-${fixtureId}.json`, { quiet: true });
  return (j.response || []).map((l: any) => ({
    fixtureId,
    teamId: l.team.id,
    formation: l.formation ?? null,
    coach: l.coach?.name ?? null,
    startXI: (l.startXI || []).map((x: any) => ({
      id: x.player.id, name: x.player.name, number: x.player.number ?? null, pos: x.player.pos ?? null, grid: x.player.grid ?? null,
    })),
    subs: (l.substitutes || []).map((x: any) => ({
      id: x.player.id, name: x.player.name, number: x.player.number ?? null, pos: x.player.pos ?? null,
    })),
  }));
}

export interface AfPlayerStat {
  fixtureId: number;
  teamId: number;
  playerId: number;
  playerName: string;
  minutes: number | null;
  rating: string | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  shotsOn: number | null;
  passes: number | null;
  passAccuracy: number | null;
  tackles: number | null;
  duelsWon: number | null;
  dribbles: number | null;
  yellow: number | null;
  red: number | null;
  captain: boolean;
}

export async function fetchAfFixturePlayers(fixtureId: number): Promise<AfPlayerStat[]> {
  const j = await afGet(`/fixtures/players?fixture=${fixtureId}`, `apifootball-fplayers-${fixtureId}.json`, { quiet: true });
  const out: AfPlayerStat[] = [];
  for (const team of j.response || []) {
    for (const p of team.players || []) {
      const s = p.statistics?.[0] || {};
      out.push({
        fixtureId,
        teamId: team.team.id,
        playerId: p.player.id,
        playerName: p.player.name,
        minutes: s.games?.minutes ?? null,
        rating: s.games?.rating ?? null,
        goals: s.goals?.total ?? null,
        assists: s.goals?.assists ?? null,
        shots: s.shots?.total ?? null,
        shotsOn: s.shots?.on ?? null,
        passes: s.passes?.total ?? null,
        passAccuracy: s.passes?.accuracy ?? null,
        tackles: s.tackles?.total ?? null,
        duelsWon: s.duels?.won ?? null,
        dribbles: s.dribbles?.success ?? null,
        yellow: s.cards?.yellow ?? null,
        red: s.cards?.red ?? null,
        captain: !!s.games?.captain,
      });
    }
  }
  return out;
}

export interface AfOdds {
  fixtureId: number;
  bookmaker: string;
  homeOdd: number | null;
  drawOdd: number | null;
  awayOdd: number | null;
}

/**
 * Pre-match 1X2 odds for a fixture, one entry per bookmaker. Reads the
 * "Match Winner" market (bet id 1) and maps Home/Draw/Away → decimal odds.
 * Returns [] when the API hasn't priced the fixture yet (normal pre-tournament
 * or far-out matches). Cached like the other per-fixture calls.
 */
export async function fetchAfFixtureOdds(fixtureId: number): Promise<AfOdds[]> {
  const j = await afGet(`/odds?fixture=${fixtureId}`, `apifootball-odds-${fixtureId}.json`, { quiet: true });
  const out: AfOdds[] = [];
  for (const r of j.response || []) {
    for (const bm of r.bookmakers || []) {
      const mw = (bm.bets || []).find((b: any) => b.id === 1 || b.name === 'Match Winner');
      if (!mw) continue;
      const pick = (label: string) => {
        const v = (mw.values || []).find((x: any) => x.value === label);
        const n = v ? parseFloat(v.odd) : NaN;
        return Number.isFinite(n) ? n : null;
      };
      out.push({ fixtureId, bookmaker: bm.name, homeOdd: pick('Home'), drawOdd: pick('Draw'), awayOdd: pick('Away') });
    }
  }
  return out;
}

export interface AfInjury {
  fixtureId: number | null;
  afTeamId: number | null;
  afPlayerId: number | null;
  playerName: string;
  type: string | null;    // "Missing Fixture" | "Questionable" | ...
  reason: string | null;  // "Calf Injury" | "Suspended" | ...
  date: string | null;    // fixture date (ISO)
}

/**
 * Injuries & suspensions for the whole tournament (one call, league+season).
 * A key writer-facing fact. Forced fresh each run (REFRESH) since it changes as
 * squads announce; not cached by fixture.
 */
export async function fetchAfInjuries(opts: { force?: boolean } = {}): Promise<AfInjury[]> {
  const j = await afGet(
    `/injuries?league=${WC_LEAGUE}&season=${WC_SEASON}`,
    'apifootball-injuries-2026.json',
    opts,
  );
  return (j.response || []).map((r: any) => ({
    fixtureId: r.fixture?.id ?? null,
    afTeamId: r.team?.id ?? null,
    afPlayerId: r.player?.id ?? null,
    playerName: r.player?.name ?? '',
    type: r.player?.type ?? null,
    reason: r.player?.reason ?? null,
    date: r.fixture?.date ?? null,
  }));
}
