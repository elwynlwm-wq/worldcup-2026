// Warehouse data access (build-time only).
//
// Reads the curated JSON the data pipeline exports
// (data-pipeline/warehouse/export/*). These imports are BUILD INPUTS — Astro
// compiles them into static HTML; the files themselves never ship, and the
// SQLite DB they came from is never anywhere near the deploy. Pages/islands get
// only the minimal slice they render (see docs/seo.md "data exposure").
//
// This sits alongside the snapshot-based provider (provider.ts). It exposes the
// NEW signals the snapshot doesn't have: all-time head-to-head and strength tiers.

import h2hData from '../../data-pipeline/warehouse/export/h2h.json';
import playersData from '../../data-pipeline/warehouse/export/players.json';
import matchGoalsData from '../../data-pipeline/warehouse/export/match-goals.json';
import wcMatchesData from '../../data-pipeline/warehouse/export/wc-matches.json';
import h2hByTeamData from '../../data-pipeline/warehouse/export/h2h-by-team.json';
import afFixturesData from '../../data-pipeline/warehouse/export/af-fixtures.json';
import ssByPairData from '../../data-pipeline/warehouse/export/ss-by-pair.json';
import afMatchDetailData from '../../data-pipeline/warehouse/export/af-match-detail.json';
import oddsByPairData from '../../data-pipeline/warehouse/export/odds-by-pair.json';
import playerWcStatsData from '../../data-pipeline/warehouse/export/player-wc-stats.json';
import afLineupsData from '../../data-pipeline/warehouse/export/af-lineups.json';

export interface H2HRecord {
  played: number;
  aWins: number;
  draws: number;
  bWins: number;
  aGoals: number;
  bGoals: number;
  lastMeeting: string;
  lastAScore: number | null;
  lastBScore: number | null;
}

export type TierLabel = string; // "Elite" | "Strong" | ... (club) / "Elite" | "Established" | ... (player)

interface WarehousePlayer {
  id: string;
  teamId: string;
  name: string;
  position: string;
  club: string | null;
  clubTier: TierLabel | null;
  playerTier: TierLabel | null;
  photo: string | null;
}

export interface AfFixture {
  id: number;
  date: string;
  status: string; // FT | NS | 1H | HT | ...
  elapsed: number | null;
  stage: string;
  round: string;
  venue: string | null;
  city: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface MatchGoal {
  side: 'home' | 'away';
  teamId: string | null;
  scorer: string;
  minute: string;
  penalty: boolean;
}

const h2h = h2hData as Record<string, H2HRecord>;
const players = playersData as WarehousePlayer[];
const matchGoals = matchGoalsData as Record<string, MatchGoal[]>;

export interface WarehouseMatch {
  id: string;
  stage: string;
  groupLetter: string | null;
  kickoff: string;
  venue: string | null;
  city: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}
const wcMatches = wcMatchesData as WarehouseMatch[];

// Index players by id once for cheap lookup at build.
const playerById = new Map(players.map((p) => [p.id, p]));

/**
 * All-time head-to-head from teamA's point of view, or null if the two have
 * never met (or aren't both mapped WC nations).
 */
export function getH2H(teamA: string, teamB: string): H2HRecord | null {
  return h2h[`${teamA}__${teamB}`] ?? null;
}

/** Club + player strength tiers + photo for a player, by warehouse player id. */
export function getPlayerTiers(
  playerId: string,
): {
  clubTier: TierLabel | null;
  playerTier: TierLabel | null;
  club: string | null;
  photo: string | null;
} | null {
  const p = playerById.get(playerId);
  if (!p) return null;
  return { clubTier: p.clubTier, playerTier: p.playerTier, club: p.club, photo: p.photo };
}

/** All warehouse players for a team (used to enrich squad views with tiers). */
export function getTeamPlayers(teamId: string): WarehousePlayer[] {
  return players.filter((p) => p.teamId === teamId);
}

/**
 * Per-team H2H map (teamId → opponentId → record, from the team's POV).
 * Passed to the predictor island so any matchup can show its all-time record
 * client-side. H2H aggregates are public data — fine to ship in the page.
 */
export function getH2HByTeam(): Record<string, Record<string, H2HRecord>> {
  return h2hByTeamData as Record<string, Record<string, H2HRecord>>;
}

/** Goalscorers for a WC match (by warehouse match id, e.g. "wc-0"), in order. */
export function getMatchGoals(matchId: string): MatchGoal[] {
  return matchGoals[matchId] ?? [];
}

/** All WC fixtures/results from the warehouse (104, with venues). */
export function getWarehouseMatches(): WarehouseMatch[] {
  return wcMatches;
}

const afFixtures = afFixturesData as AfFixture[];

/** Fresh AF fixtures (the live source). */
export function getAfFixtures(): AfFixture[] {
  return afFixtures;
}

/** Most recent FINISHED matches from the fresh API-Football feed, newest first. */
export function getRecentResults(limit = 6): AfFixture[] {
  return afFixtures
    .filter((m) => m.status === 'FT')
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}

/** Upcoming (not-started) AF fixtures, soonest first. */
export function getUpcomingFixtures(limit = 8): AfFixture[] {
  return afFixtures
    .filter((m) => m.status === 'NS')
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, limit);
}

// --- SofaScore predicted signals (dev source), by unordered team pair --------
export interface SsLineup {
  formation: string | null;
  starters: { name: string; pos: string | null; jersey: string | null }[];
  subs: { name: string; pos: string | null; jersey: string | null }[];
}
export interface SsPair {
  homeId: string;
  awayId: string;
  votes: { homeId: string; awayId: string; home: number; draw: number; away: number } | null;
  /** true once `votes` is the frozen pre-match snapshot (KO−1h), not the live feed. */
  frozen?: boolean;
  lineups: Record<string, SsLineup>;
}
const ssByPair = ssByPairData as Record<string, SsPair>;

/** Predicted lineups + who-will-win votes for a pairing (order-independent). */
export function getSsPair(a: string, b: string): SsPair | null {
  return ssByPair[[a, b].sort().join('__')] ?? null;
}

// --- Played-match detail (AF): key team stats + goals, by AF fixture id ------
export interface AfMatchDetail {
  stats: Record<string, Record<string, string>>; // statType → { teamId: value }
  goals: { teamId: string; scorer: string; minute: number; pen: boolean }[];
}
const afMatchDetail = afMatchDetailData as Record<string, AfMatchDetail>;
export function getMatchDetail(fixtureId: number): AfMatchDetail | null {
  return afMatchDetail[String(fixtureId)] ?? null;
}

/** All pairs that have SofaScore data — for generating H2H static paths. */
export function getSsPairKeys(): string[] {
  return Object.keys(ssByPair);
}

// --- Bookmaker 1X2 odds (API-Football), by unordered team pair --------------
export interface OddsBook {
  bookmaker: string;
  home: number;
  draw: number;
  away: number;
}
export interface OddsPair {
  homeId: string;
  awayId: string;
  /** true once odds are the frozen pre-match snapshot (KO−1h), not the live feed. */
  frozen: boolean;
  books: OddsBook[];
}
const oddsByPair = oddsByPairData as Record<string, OddsPair>;

/** Bookmaker odds for a pairing (order-independent), or null if unpriced. */
export function getOddsPair(a: string, b: string): OddsPair | null {
  return oddsByPair[[a, b].sort().join('__')] ?? null;
}

// --- Per-player WC tournament stats (by API-Football player id) -------------
export interface PlayerWcMatch {
  homeId: string; awayId: string; homeScore: number | null; awayScore: number | null;
  stage: string; date: string;
  minutes: number | null; rating: string | null; goals: number | null; assists: number | null;
  shots: number | null; shotsOn: number | null; passes: number | null; passAccuracy: number | null;
  yellow: number | null; red: number | null;
}
export interface PlayerWcStats {
  apps: number; mins: number; goals: number; assists: number; matches: PlayerWcMatch[];
}
const playerWcStats = playerWcStatsData as Record<string, PlayerWcStats>;

/** The API-Football player id embedded in a photo URL (…/players/<id>.png), or null. */
export function afPlayerId(photo: string | null | undefined): string | null {
  const m = photo?.match(/\/players\/(\d+)\.png/);
  return m ? m[1] : null;
}

/** A player's WC tournament log + totals, looked up by AF player id. */
export function getPlayerWcStats(afId: string | null): PlayerWcStats | null {
  return afId ? playerWcStats[afId] ?? null : null;
}

// --- Actual match lineups (AF), by AF fixture id → { teamId: SsLineup+coach } --
const afLineups = afLineupsData as Record<string, Record<string, SsLineup & { coach?: string }>>;

/** The real XIs that played a finished fixture (by AF fixture id), or null. */
export function getActualLineups(fixtureId: number): Record<string, SsLineup & { coach?: string }> | null {
  return afLineups[String(fixtureId)] ?? null;
}
