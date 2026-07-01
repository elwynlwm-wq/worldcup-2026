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
  fetchAfFixtures,
  fetchAfTeams,
  fetchAfSquad,
  fetchAfStandings,
  fetchAfFixtureStats,
  fetchAfFixtureEvents,
  fetchAfFixtureLineups,
  fetchAfFixturePlayers,
  fetchAfFixtureOdds,
} from '../fetch/apifootball';
import { fetchSsMatches, fetchSsVotes, fetchSsLineup } from '../fetch/sofascore';
import {
  clubLookupSlug,
  countryToTeamSlug,
  leagueTierHintForCountry,
  inferCountryForUnmatchedClub,
  surnameKey,
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

// API-Football round labels → our stage codes ("Group Stage - 1", "Round of 16"…).
function stageForAfRound(round: string): string {
  const r = round.toLowerCase();
  if (r.includes('group')) return 'group';
  if (r.includes('round of 32')) return 'r32';
  if (r.includes('round of 16')) return 'r16';
  if (r.includes('quarter')) return 'qf';
  if (r.includes('semi')) return 'sf';
  if (r.includes('3rd place') || r.includes('third')) return 'third_place';
  if (r.includes('final')) return 'final';
  return 'group';
}

async function main() {
  ensureDir(WAREHOUSE_DIR);
  // REFRESH=1 forces the LIVE sources (fixtures list, standings, SS match list) to
  // re-hit the API so new results/statuses land. Per-fixture detail stays cached by
  // id, so only NEWLY-finished matches (no cache yet) fetch their stats/events —
  // keeping the hourly API budget tiny. Dev runs (no REFRESH) stay fully cached.
  const REFRESH = process.env.REFRESH === '1';
  if (REFRESH) console.log('REFRESH=1 — forcing live fixtures/standings/SS refresh');
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

  // ---- API-Football (paid): fresh fixtures + player photos -----------------
  // Lands in af_* tables (cross-check namespace) and attaches photos to our
  // players by surname. See SOURCING.md for the publish-rights caveat.
  console.log('Loading API-Football (paid)…');
  const afTeams = await fetchAfTeams();
  const afTeamSlug = new Map<number, string | null>();
  for (const t of afTeams) afTeamSlug.set(t.id, countryToTeamSlug(t.name, validTeamIds));

  // Fixtures
  const afFixtures = await fetchAfFixtures({ force: REFRESH });
  const insAfFixture = db.prepare(`INSERT OR REPLACE INTO af_fixture
    (id,date,status_short,status_long,elapsed,round,stage,venue,city,
     home_team_id,away_team_id,home_name_raw,away_name_raw,home_score,away_score)
    VALUES (@id,@date,@statusShort,@statusLong,@elapsed,@round,@stage,@venue,@city,
     @homeTeamId,@awayTeamId,@homeNameRaw,@awayNameRaw,@homeScore,@awayScore)`);
  db.transaction(() => {
    for (const f of afFixtures) {
      insAfFixture.run({
        id: f.id,
        date: f.date,
        statusShort: f.statusShort,
        statusLong: f.statusLong,
        elapsed: f.elapsed,
        round: f.round,
        stage: stageForAfRound(f.round),
        venue: f.venue,
        city: f.city,
        homeTeamId: countryToTeamSlug(f.homeName, validTeamIds),
        awayTeamId: countryToTeamSlug(f.awayName, validTeamIds),
        homeNameRaw: f.homeName,
        awayNameRaw: f.awayName,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
      });
    }
  })();
  const afFinished = afFixtures.filter((f) => f.statusShort === 'FT').length;
  console.log(`  ${afFixtures.length} AF fixtures (${afFinished} finished)`);

  // Squads (one call per team) → af_player + attach photo to our players by surname.
  const insAfPlayer = db.prepare(`INSERT OR REPLACE INTO af_player
    (id,team_id,name,number,position,photo) VALUES (@id,@teamId,@name,@number,@position,@photo)`);
  const updPhoto = db.prepare(`UPDATE player SET photo=@photo WHERE id=@id`);
  // index our players by (teamSlug, surname) for matching
  const ourBySurname = new Map<string, string>(); // `${slug}|${surname}` → player.id
  for (const p of snap.players) ourBySurname.set(`${p.teamId}|${surnameKey(p.name)}`, p.id);

  let photoMatched = 0;
  let afPlayerCount = 0;
  for (const t of afTeams) {
    const ourSlug = afTeamSlug.get(t.id) ?? null;
    const squad = await fetchAfSquad(t.id);
    db.transaction(() => {
      for (const ap of squad) {
        insAfPlayer.run({
          id: ap.id,
          teamId: ourSlug,
          name: ap.name,
          number: ap.number,
          position: ap.position,
          photo: ap.photo,
        });
        afPlayerCount++;
        if (ourSlug && ap.photo) {
          const ourId = ourBySurname.get(`${ourSlug}|${surnameKey(ap.name)}`);
          if (ourId) {
            updPhoto.run({ photo: ap.photo, id: ourId });
            photoMatched++;
          }
        }
      }
    })();
  }
  console.log(`  ${afPlayerCount} AF players; ${photoMatched}/${snap.players.length} photos matched to our players`);

  // ---- AF standings (group tables) ----
  const standings = await fetchAfStandings({ force: REFRESH });
  const insStanding = db.prepare(`INSERT INTO af_standing
    (group_name,rank,team_id,team_name_raw,played,win,draw,lose,goals_for,goals_against,points,form)
    VALUES (@group_name,@rank,@team_id,@team_name_raw,@played,@win,@draw,@lose,@goals_for,@goals_against,@points,@form)`);
  db.transaction(() => {
    for (const s of standings) {
      insStanding.run({
        group_name: s.group, rank: s.rank,
        team_id: afTeamSlug.get(s.teamId) ?? null, team_name_raw: s.teamName,
        played: s.played, win: s.win, draw: s.draw, lose: s.lose,
        goals_for: s.goalsFor, goals_against: s.goalsAgainst, points: s.points, form: s.form,
      });
    }
  })();
  console.log(`  ${standings.length} standing rows`);

  // ---- Per-fixture rich data (team stats / events / lineups / player stats) ----
  // One call each per PLAYED fixture. ~73 played × 4 ≈ 290 calls (Pro: 7500/day).
  const played = afFixtures.filter((f) => f.statusShort === 'FT');
  const insTeamStat = db.prepare(`INSERT OR REPLACE INTO af_team_stat
    (fixture_id,af_team_id,team_id,stat_type,stat_value) VALUES (@fixture_id,@af_team_id,@team_id,@stat_type,@stat_value)`);
  const insEvent = db.prepare(`INSERT INTO af_event
    (fixture_id,minute,extra,af_team_id,team_id,player_id,player_name,assist_name,type,detail)
    VALUES (@fixture_id,@minute,@extra,@af_team_id,@team_id,@player_id,@player_name,@assist_name,@type,@detail)`);
  const insLineup = db.prepare(`INSERT OR REPLACE INTO af_lineup
    (fixture_id,af_team_id,team_id,formation,coach) VALUES (@fixture_id,@af_team_id,@team_id,@formation,@coach)`);
  const insLineupP = db.prepare(`INSERT INTO af_lineup_player
    (fixture_id,af_team_id,player_id,player_name,number,pos,grid,starter)
    VALUES (@fixture_id,@af_team_id,@player_id,@player_name,@number,@pos,@grid,@starter)`);
  const insPStat = db.prepare(`INSERT INTO af_player_stat
    (fixture_id,af_team_id,team_id,player_id,player_name,minutes,rating,goals,assists,shots,shots_on,passes,pass_accuracy,tackles,duels_won,dribbles,yellow,red,captain)
    VALUES (@fixture_id,@af_team_id,@team_id,@player_id,@player_name,@minutes,@rating,@goals,@assists,@shots,@shots_on,@passes,@pass_accuracy,@tackles,@duels_won,@dribbles,@yellow,@red,@captain)`);

  let nStats = 0, nEvents = 0, nLineups = 0, nPStats = 0;
  for (let i = 0; i < played.length; i++) {
    const f = played[i];
    if (i % 20 === 0) console.log(`  fixtures ${i}/${played.length}…`);
    const [stats, events, lineups, pstats] = await Promise.all([
      fetchAfFixtureStats(f.id),
      fetchAfFixtureEvents(f.id),
      fetchAfFixtureLineups(f.id),
      fetchAfFixturePlayers(f.id),
    ]);
    db.transaction(() => {
      for (const t of stats)
        for (const [type, val] of Object.entries(t.stats)) {
          insTeamStat.run({ fixture_id: t.fixtureId, af_team_id: t.teamId, team_id: afTeamSlug.get(t.teamId) ?? null, stat_type: type, stat_value: val == null ? null : String(val) });
          nStats++;
        }
      for (const e of events) {
        insEvent.run({ fixture_id: e.fixtureId, minute: e.minute, extra: e.extra, af_team_id: e.teamId, team_id: e.teamId ? afTeamSlug.get(e.teamId) ?? null : null, player_id: e.playerId, player_name: e.playerName, assist_name: e.assistName, type: e.type, detail: e.detail });
        nEvents++;
      }
      for (const l of lineups) {
        insLineup.run({ fixture_id: l.fixtureId, af_team_id: l.teamId, team_id: afTeamSlug.get(l.teamId) ?? null, formation: l.formation, coach: l.coach });
        for (const p of l.startXI) insLineupP.run({ fixture_id: l.fixtureId, af_team_id: l.teamId, player_id: p.id, player_name: p.name, number: p.number, pos: p.pos, grid: p.grid, starter: 1 });
        for (const p of l.subs) insLineupP.run({ fixture_id: l.fixtureId, af_team_id: l.teamId, player_id: p.id, player_name: p.name, number: p.number, pos: p.pos, grid: null, starter: 0 });
        nLineups++;
      }
      for (const p of pstats) {
        insPStat.run({ fixture_id: p.fixtureId, af_team_id: p.teamId, team_id: afTeamSlug.get(p.teamId) ?? null, player_id: p.playerId, player_name: p.playerName, minutes: p.minutes, rating: p.rating, goals: p.goals, assists: p.assists, shots: p.shots, shots_on: p.shotsOn, passes: p.passes, pass_accuracy: p.passAccuracy, tackles: p.tackles, duels_won: p.duelsWon, dribbles: p.dribbles, yellow: p.yellow, red: p.red, captain: p.captain ? 1 : 0 });
        nPStats++;
      }
    })();
  }
  console.log(`  rich data: ${nStats} team-stat rows, ${nEvents} events, ${nLineups} lineups, ${nPStats} player-match rows`);

  // ---- Pre-match 1X2 odds for upcoming fixtures (API-Football) -------------
  // Odds only exist near kick-off, so the API returns [] for far-out matches —
  // that's fine, we just store what's priced. Cached per fixture like the rest.
  const insOdds = db.prepare(`INSERT INTO af_odds
    (fixture_id,bookmaker,home_odd,draw_odd,away_odd)
    VALUES (@fixture_id,@bookmaker,@home_odd,@draw_odd,@away_odd)`);
  const upcoming = afFixtures.filter((f) => f.statusShort !== 'FT');
  let nOdds = 0, nPriced = 0;
  for (let i = 0; i < upcoming.length; i++) {
    const f = upcoming[i];
    if (i % 20 === 0) console.log(`  odds ${i}/${upcoming.length}…`);
    const odds = await fetchAfFixtureOdds(f.id);
    if (odds.length) nPriced++;
    db.transaction(() => {
      for (const o of odds) {
        insOdds.run({ fixture_id: o.fixtureId, bookmaker: o.bookmaker, home_odd: o.homeOdd, draw_odd: o.drawOdd, away_odd: o.awayOdd });
        nOdds++;
      }
    })();
  }
  console.log(`  odds: ${nOdds} bookmaker rows across ${nPriced}/${upcoming.length} priced fixtures`);

  // ---- SofaScore (DEV source): who-will-win votes + PREDICTED lineups -------
  // Scraped/resold — not for publishing. Reconcile SS matches → our team slugs
  // by name; fetch votes + predicted XI only for mapped matches (saves calls).
  console.log('Loading SofaScore (dev source: votes + predicted lineups)…');
  const ssMatches = await fetchSsMatches({ force: REFRESH });
  const insSsMatch = db.prepare(`INSERT OR REPLACE INTO ss_match
    (id,home_team_id,away_team_id,home_name_raw,away_name_raw,start_ts,status)
    VALUES (@id,@home_team_id,@away_team_id,@home_name_raw,@away_name_raw,@start_ts,@status)`);
  const insSsVote = db.prepare(`INSERT OR REPLACE INTO ss_vote
    (match_id,vote_home,vote_draw,vote_away) VALUES (@match_id,@vote_home,@vote_draw,@vote_away)`);
  const insSsPred = db.prepare(`INSERT INTO ss_predicted_lineup_player
    (match_id,side,team_id,confirmed,formation,player_name,position,jersey,substitute)
    VALUES (@match_id,@side,@team_id,@confirmed,@formation,@player_name,@position,@jersey,@substitute)`);

  const mappedSs = ssMatches
    .map((m) => ({
      ...m,
      homeId: countryToTeamSlug(m.homeName, validTeamIds),
      awayId: countryToTeamSlug(m.awayName, validTeamIds),
    }))
    .filter((m) => m.homeId || m.awayId);

  db.transaction(() => {
    for (const m of mappedSs)
      insSsMatch.run({
        id: m.id, home_team_id: m.homeId, away_team_id: m.awayId,
        home_name_raw: m.homeName, away_name_raw: m.awayName, start_ts: m.startTimestamp, status: m.status,
      });
  })();

  let nVotes = 0, nPred = 0;
  for (const m of mappedSs) {
    const [votes, lineup] = await Promise.all([fetchSsVotes(m.id), fetchSsLineup(m.id)]);
    db.transaction(() => {
      if (votes) {
        insSsVote.run({ match_id: m.id, vote_home: votes.vote1, vote_draw: votes.voteX, vote_away: votes.vote2 });
        nVotes++;
      }
      if (lineup) {
        for (const [side, players, teamId, formation] of [
          ['home', lineup.home, m.homeId, lineup.homeFormation],
          ['away', lineup.away, m.awayId, lineup.awayFormation],
        ] as const) {
          for (const p of players) {
            insSsPred.run({
              match_id: m.id, side, team_id: teamId, confirmed: lineup.confirmed ? 1 : 0,
              formation, player_name: p.name, position: p.position, jersey: p.jersey,
              substitute: p.substitute ? 1 : 0,
            });
          }
        }
        if (lineup.home.length || lineup.away.length) nPred++;
      }
    })();
  }
  console.log(`  ${mappedSs.length} SS matches mapped; ${nVotes} with votes, ${nPred} with (predicted) lineups`);

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
