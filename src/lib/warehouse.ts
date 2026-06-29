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

export interface H2HRecord {
  played: number;
  aWins: number;
  draws: number;
  bWins: number;
  aGoals: number;
  bGoals: number;
  lastMeeting: string;
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

/** Club + player strength tiers for a player, by warehouse player id. */
export function getPlayerTiers(
  playerId: string,
): { clubTier: TierLabel | null; playerTier: TierLabel | null; club: string | null } | null {
  const p = playerById.get(playerId);
  if (!p) return null;
  return { clubTier: p.clubTier, playerTier: p.playerTier, club: p.club };
}

/** All warehouse players for a team (used to enrich squad views with tiers). */
export function getTeamPlayers(teamId: string): WarehousePlayer[] {
  return players.filter((p) => p.teamId === teamId);
}

/** Goalscorers for a WC match (by warehouse match id, e.g. "wc-0"), in order. */
export function getMatchGoals(matchId: string): MatchGoal[] {
  return matchGoals[matchId] ?? [];
}

/** All WC fixtures/results from the warehouse (104, with venues). */
export function getWarehouseMatches(): WarehouseMatch[] {
  return wcMatches;
}

/** Most recent finished matches, newest first. */
export function getRecentResults(limit = 6): WarehouseMatch[] {
  return wcMatches
    .filter((m) => m.status === 'finished')
    .sort((a, b) => (a.kickoff < b.kickoff ? 1 : -1))
    .slice(0, limit);
}
