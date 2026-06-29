// Export JSON slices from the warehouse for the app to consume.
// These committed JSON files are the "rendering cache" the static site reads via
// the provider seam (see V1-PLAN.md). The SQLite DB itself stays out of git.
// Run: npm run export  (after build:warehouse)

import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WAREHOUSE_DIR, EXPORT_DIR, ensureDir } from '../lib/util';

const DB_PATH = join(WAREHOUSE_DIR, 'warehouse.db');

function main() {
  ensureDir(EXPORT_DIR);
  const db = new Database(DB_PATH, { readonly: true });

  const write = (name: string, data: unknown) => {
    const path = join(EXPORT_DIR, name);
    writeFileSync(path, JSON.stringify(data, null, 0));
    const n = Array.isArray(data) ? data.length : Object.keys(data as object).length;
    console.log(`  ✓ ${name} (${n} entries)`);
  };

  // teams.json — team + its derived bits the site needs
  const teams = db
    .prepare(
      `SELECT id,name,short_code AS shortCode,confederation,group_letter AS groupLetter,
              coach_name AS coach,elo,fifa_rank AS fifaRank,points,goal_diff AS goalDiff,status
       FROM team ORDER BY name`,
    )
    .all();
  write('teams.json', teams);

  // players.json — player + club + both tiers (the signals backbone for UI)
  const players = db
    .prepare(
      `SELECT p.id,p.team_id AS teamId,p.name,p.position,p.age,p.caps,p.goals,
              c.name AS club, ct.tier_label AS clubTier,
              pt.tier_label AS playerTier
       FROM player p
       LEFT JOIN club c ON p.club_id = c.id
       LEFT JOIN club_tier ct ON c.id = ct.club_id
       LEFT JOIN player_tier pt ON p.id = pt.player_id
       ORDER BY p.team_id, p.position`,
    )
    .all();
  write('players.json', players);

  // h2h.json — keyed "teamA__teamB" → record (both directions present)
  const h2hRows = db
    .prepare(
      `SELECT team_a AS a,team_b AS b,played,a_wins AS aWins,draws,b_wins AS bWins,
              a_goals AS aGoals,b_goals AS bGoals,last_meeting AS lastMeeting,
              last_a_score AS lastAScore,last_b_score AS lastBScore FROM h2h`,
    )
    .all() as Array<{ a: string; b: string; [k: string]: unknown }>;
  const h2h: Record<string, unknown> = {};
  // Scoped per-team slice for the island: team → { opponentId → record }.
  // Lets the Predictor look up one matchup without shipping the full flat map.
  const h2hByTeam: Record<string, Record<string, unknown>> = {};
  for (const r of h2hRows) {
    const { a, b, ...rest } = r;
    h2h[`${a}__${b}`] = rest;
    (h2hByTeam[a] ??= {})[b] = rest;
  }
  write('h2h.json', h2h);
  write('h2h-by-team.json', h2hByTeam);

  // wc-matches.json — fixtures/results
  const matches = db
    .prepare(
      `SELECT id,stage,group_letter AS groupLetter,kickoff,venue,city,
              home_team_id AS homeTeamId,away_team_id AS awayTeamId,
              home_score AS homeScore,away_score AS awayScore,status
       FROM wc_match`,
    )
    .all();
  write('wc-matches.json', matches);

  // match-goals.json — goalscorers keyed by match id
  const goalRows = db
    .prepare(
      `SELECT match_id AS matchId, side, team_id AS teamId, scorer, minute, penalty
       FROM match_goal ORDER BY match_id, CAST(minute AS INTEGER)`,
    )
    .all() as Array<{ matchId: string; [k: string]: unknown }>;
  const goalsByMatch: Record<string, unknown[]> = {};
  for (const g of goalRows) {
    const { matchId, ...rest } = g;
    (goalsByMatch[matchId] ??= []).push({ ...rest, penalty: rest.penalty === 1 });
  }
  write('match-goals.json', goalsByMatch);

  // meta.json — provenance + counts, so consumers know what they're reading
  const count = (t: string) => (db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n;
  write('meta.json', {
    builtFrom: ['snapshot', 'openfootball', 'clubelo', 'martj42/international_results'],
    note: 'v1 free-source warehouse export. Derived tiers are our own coarse signal, not copied ratings.',
    counts: {
      teams: count('team'),
      players: count('player'),
      clubs: count('club'),
      h2hPairs: count('h2h'),
      intlResults: count('intl_result'),
      wcMatches: count('wc_match'),
      goals: count('match_goal'),
    },
  });

  db.close();
  console.log(`\nExported to ${EXPORT_DIR}`);
}

main();
