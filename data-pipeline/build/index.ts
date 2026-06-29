// Build the SQLite warehouse: create schema, load all sources, link entities,
// then derive signals. Idempotent — drops and rebuilds from scratch each run.
// Run: npm run build:warehouse  (after npm run fetch)

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, WAREHOUSE_DIR, ensureDir, slug } from '../lib/util';
import { loadSnapshot } from '../fetch/snapshot';
import { fetchClubElo } from '../fetch/clubelo';
import { fetchIntlResults } from '../fetch/intlresults';
import { fetchOpenfootball } from '../fetch/openfootball';
import {
  clubLookupSlug,
  countryToTeamSlug,
  leagueTierHintForCountry,
  inferCountryForUnmatchedClub,
} from './reconcile';
import { deriveH2H, deriveTiers } from './derive';

const DB_PATH = join(WAREHOUSE_DIR, 'warehouse.db');

// Map openfootball round labels → our stage codes.
function stageForRound(round: string): string {
  const r = round.toLowerCase();
  if (r.startsWith('matchday')) return 'group';
  if (r.includes('round of 32')) return 'r32';
  if (r.includes('round of 16')) return 'r16';
  if (r.includes('quarter')) return 'qf';
  if (r.includes('semi')) return 'sf';
  if (r.includes('third')) return 'third_place';
  if (r.includes('final')) return 'final';
  return 'group';
}

async function main() {
  ensureDir(WAREHOUSE_DIR);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  console.log('Creating schema…');
  db.exec(readFileSync(join(ROOT, 'schema.sql'), 'utf8'));

  // ---- Load snapshot (teams, players, WC matches) ----
  console.log('Loading snapshot…');
  const snap = loadSnapshot();
  const validTeamIds = new Set(snap.teams.map((t) => t.id));

  const insTeam = db.prepare(`INSERT INTO team
    (id,name,short_code,confederation,group_letter,coach_name,elo,fifa_rank,points,goal_diff,status)
    VALUES (@id,@name,@shortCode,@confederation,@groupLetter,@coachName,@elo,@fifaRank,@points,@goalDiff,@status)`);
  db.transaction(() => snap.teams.forEach((t) => insTeam.run(t)))();
  console.log(`  ${snap.teams.length} teams`);

  // ---- Clubs: derive a club table from distinct player club names ----
  const clubElo = await fetchClubElo();
  const eloBySlug = new Map<string, { elo: number; country: string; level: number | null }>();
  for (const c of clubElo) {
    eloBySlug.set(slug(c.club), { elo: c.elo, country: c.country, level: c.level });
  }

  // leagues: a minimal set keyed by country-of-club (coarse). We create a league
  // row per distinct clubelo country we touch, plus an "unknown" bucket.
  const leagueByCountry = new Map<string, string>();
  const insLeague = db.prepare(
    `INSERT OR IGNORE INTO league (id,name,country,tier_hint) VALUES (@id,@name,@country,@tier_hint)`,
  );

  const distinctClubs = [...new Set(snap.players.map((p) => p.club))].filter(
    (c) => c && c !== 'Unattached',
  );
  const insClub = db.prepare(
    `INSERT OR IGNORE INTO club (id,name,clubelo_name,league_id,elo) VALUES (@id,@name,@clubelo_name,@league_id,@elo)`,
  );
  const clubIdByName = new Map<string, string>();
  let matched = 0;
  db.transaction(() => {
    for (const name of distinctClubs) {
      const cid = slug(name);
      clubIdByName.set(name, cid);
      const lookup = clubLookupSlug(name);
      const hit = eloBySlug.get(lookup);
      // Country: clubelo's where matched, else inferred from the club name
      // (so non-European clubs still get a league-strength fallback).
      const country = hit
        ? hit.country || 'unknown'
        : inferCountryForUnmatchedClub(name);
      let leagueId: string | null = null;
      if (country) {
        leagueId = 'league-' + slug(country);
        if (!leagueByCountry.has(country)) {
          leagueByCountry.set(country, leagueId);
          insLeague.run({
            id: leagueId,
            name: country + ' (top divisions)',
            country,
            tier_hint: leagueTierHintForCountry(country),
          });
        }
      }
      if (hit) matched++;
      insClub.run({
        id: cid,
        name,
        clubelo_name: hit ? lookup : null,
        league_id: leagueId,
        elo: hit ? hit.elo : null,
      });
    }
  })();
  console.log(`  ${distinctClubs.length} clubs (${matched} matched to clubelo, ${distinctClubs.length - matched} fallback)`);

  // ---- Players (link to club) ----
  const insPlayer = db.prepare(`INSERT INTO player
    (id,team_id,club_id,name,position,age,caps,goals)
    VALUES (@id,@teamId,@clubId,@name,@position,@age,@caps,@goals)`);
  db.transaction(() =>
    snap.players.forEach((p) =>
      insPlayer.run({ ...p, clubId: clubIdByName.get(p.club) ?? null }),
    ),
  )();
  console.log(`  ${snap.players.length} players`);

  // ---- WC matches (openfootball: all 104, with venues + goalscorers) ----
  const of = await fetchOpenfootball();
  const insWc = db.prepare(`INSERT INTO wc_match
    (id,stage,group_letter,kickoff,venue,city,home_team_id,away_team_id,home_score,away_score,status)
    VALUES (@id,@stage,@groupLetter,@kickoff,@venue,@city,@homeTeamId,@awayTeamId,@homeScore,@awayScore,@status)`);
  const insGoal = db.prepare(`INSERT INTO match_goal
    (match_id,side,team_id,scorer,minute,penalty)
    VALUES (@matchId,@side,@teamId,@scorer,@minute,@penalty)`);
  let goalCount = 0;
  db.transaction(() => {
    of.forEach((m, i) => {
      const stage = stageForRound(m.round);
      const homeId = countryToTeamSlug(m.team1, validTeamIds); // null for TBD placeholders
      const awayId = countryToTeamSlug(m.team2, validTeamIds);
      const played = m.ftHome != null && m.ftAway != null;
      const matchId = 'wc-' + i;
      insWc.run({
        id: matchId,
        stage,
        groupLetter: m.group ? m.group.replace(/^Group\s+/i, '') : null,
        kickoff: m.date + (m.time ? 'T' + m.time : ''),
        venue: m.ground,
        city: m.ground, // openfootball "ground" is a city/venue label
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeScore: m.ftHome,
        awayScore: m.ftAway,
        status: played ? 'finished' : 'scheduled',
      });
      for (const [side, goals, teamId] of [
        ['home', m.goals1, homeId],
        ['away', m.goals2, awayId],
      ] as const) {
        for (const g of goals) {
          insGoal.run({
            matchId,
            side,
            teamId,
            scorer: g.name,
            minute: g.minute,
            penalty: g.penalty ? 1 : 0,
          });
          goalCount++;
        }
      }
    });
  })();
  console.log(`  ${of.length} WC matches (openfootball), ${goalCount} goals`);

  // ---- All-time international results (for H2H) ----
  console.log('Loading all-time international results…');
  const intl = await fetchIntlResults();
  const insIntl = db.prepare(`INSERT INTO intl_result
    (date,home_name,away_name,home_team_id,away_team_id,home_score,away_score,tournament,neutral)
    VALUES (@date,@homeName,@awayName,@homeTeamId,@awayTeamId,@homeScore,@awayScore,@tournament,@neutral)`);
  let mappedRows = 0;
  db.transaction(() => {
    for (const r of intl) {
      const homeId = countryToTeamSlug(r.homeName, validTeamIds);
      const awayId = countryToTeamSlug(r.awayName, validTeamIds);
      if (homeId || awayId) mappedRows++;
      insIntl.run({
        date: r.date,
        homeName: r.homeName,
        awayName: r.awayName,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        tournament: r.tournament,
        neutral: r.neutral ? 1 : 0,
      });
    }
  })();
  console.log(`  ${intl.length} results (${mappedRows} involve a WC nation)`);

  // ---- Derive signals ----
  console.log('Deriving head-to-head…');
  const h2hCount = deriveH2H(db);
  console.log(`  ${h2hCount} H2H pairs`);

  console.log('Deriving tiers…');
  const { clubs, players } = deriveTiers(db);
  console.log(`  ${clubs} club tiers, ${players} player tiers`);

  db.close();
  console.log(`\nWarehouse built: ${DB_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
