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

  // ---- WC matches (snapshot) ----
  const insWc = db.prepare(`INSERT INTO wc_match
    (id,stage,group_letter,kickoff,venue,city,home_team_id,away_team_id,home_score,away_score,status)
    VALUES (@id,@stage,@groupLetter,@kickoff,@venue,@city,@homeTeamId,@awayTeamId,@homeScore,@awayScore,@status)`);
  db.transaction(() => snap.matches.forEach((m) => insWc.run(m)))();
  console.log(`  ${snap.matches.length} WC matches (snapshot)`);

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

  // ---- openfootball: enrich WC matches with venue/city where missing ----
  // (v1: lightweight — we keep the snapshot as the authority and just log overlap.)
  const of = await fetchOpenfootball();
  console.log(`  openfootball: ${of.length} matches available for future enrichment`);

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
