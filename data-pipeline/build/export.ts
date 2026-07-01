// Export JSON slices from the warehouse for the app to consume.
// These committed JSON files are the "rendering cache" the static site reads via
// the provider seam (see V1-PLAN.md). The SQLite DB itself stays out of git.
// Run: npm run export  (after build:warehouse)

import Database from 'better-sqlite3';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WAREHOUSE_DIR, EXPORT_DIR, ensureDir } from '../lib/util';

const DB_PATH = join(WAREHOUSE_DIR, 'warehouse.db');

// Prediction/odds snapshots are frozen this long BEFORE kick-off. Matches the
// "Confirmed ~1h before kick-off" lineup note in the design. Once a fixture
// crosses this line, we freeze the then-current fan votes so the published
// prediction never drifts retroactively (accountability — see the match page).
const FREEZE_LEAD_MS = 60 * 60 * 1000; // 1 hour
// Durable snapshot store. Lives in WAREHOUSE_DIR (NOT the DB), so it survives
// the schema's DROP/CREATE rebuild on every pipeline run. Committed alongside
// the exports so the static site renders the frozen value, not the live one.
const SNAPSHOT_PATH = join(WAREHOUSE_DIR, 'vote-snapshots.json');
const ODDS_SNAPSHOT_PATH = join(WAREHOUSE_DIR, 'odds-snapshots.json');

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

  // players.json — player + club + both tiers + photo (the signals backbone for UI)
  const players = db
    .prepare(
      `SELECT p.id,p.team_id AS teamId,p.name,p.position,p.age,p.caps,p.goals,p.photo,
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

  // player-wc-stats.json — each player's WC match log + totals, keyed by the
  // API-Football player id (the UI bridges to it via the AF id in the photo URL,
  // since our player.id is a slug). Only finished fixtures have player stats.
  const pStatRows = db
    .prepare(
      `SELECT ps.player_id AS afId, ps.fixture_id AS fixtureId,
              ps.minutes, ps.rating, ps.goals, ps.assists, ps.shots, ps.shots_on AS shotsOn,
              ps.passes, ps.pass_accuracy AS passAccuracy, ps.yellow, ps.red,
              f.home_team_id AS homeId, f.away_team_id AS awayId,
              f.home_score AS homeScore, f.away_score AS awayScore, f.stage, f.date
       FROM af_player_stat ps JOIN af_fixture f ON f.id = ps.fixture_id
       WHERE ps.player_id IS NOT NULL
       ORDER BY f.date`,
    )
    .all() as Array<Record<string, any>>;
  const wcByPlayer: Record<string, any> = {};
  for (const r of pStatRows) {
    const e = (wcByPlayer[r.afId] ??= { apps: 0, mins: 0, goals: 0, assists: 0, matches: [] });
    if ((r.minutes ?? 0) > 0) e.apps++;
    e.mins += r.minutes ?? 0;
    e.goals += r.goals ?? 0;
    e.assists += r.assists ?? 0;
    e.matches.push({
      homeId: r.homeId, awayId: r.awayId, homeScore: r.homeScore, awayScore: r.awayScore,
      stage: r.stage, date: r.date,
      minutes: r.minutes, rating: r.rating, goals: r.goals, assists: r.assists,
      shots: r.shots, shotsOn: r.shotsOn, passes: r.passes, passAccuracy: r.passAccuracy,
      yellow: r.yellow, red: r.red,
    });
  }
  write('player-wc-stats.json', wcByPlayer);

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

  // af-fixtures.json — fresh fixtures/results/statuses from API-Football (live source).
  // Only rows we mapped to our team slugs (drops TBD knockout placeholders cleanly).
  const afFixtures = db
    .prepare(
      `SELECT id,date,status_short AS status,elapsed,stage,round,venue,city,
              home_team_id AS homeTeamId,away_team_id AS awayTeamId,
              home_score AS homeScore,away_score AS awayScore
       FROM af_fixture
       WHERE home_team_id IS NOT NULL AND away_team_id IS NOT NULL
       ORDER BY date`,
    )
    .all();
  write('af-fixtures.json', afFixtures);

  // standings.json — official group tables (API-Football), grouped by group name.
  const standingRows = db
    .prepare(
      `SELECT group_name AS groupName, rank, team_id AS teamId, team_name_raw AS teamNameRaw,
              played, win, draw, lose, goals_for AS goalsFor, goals_against AS goalsAgainst,
              points, form
       FROM af_standing WHERE team_id IS NOT NULL ORDER BY group_name, rank`,
    )
    .all() as Array<{ groupName: string; [k: string]: unknown }>;
  const standings: Record<string, unknown[]> = {};
  for (const r of standingRows) {
    const { groupName, ...rest } = r;
    (standings[groupName] ??= []).push(rest);
  }
  write('standings.json', standings);

  // ---- SofaScore predicted signals (dev source), keyed by unordered team pair
  // "<a>__<b>" sorted, so the H2H page can look up regardless of home/away.
  const ssMatches = db
    .prepare(
      `SELECT id, home_team_id AS h, away_team_id AS a, start_ts AS startTs FROM ss_match
       WHERE home_team_id IS NOT NULL AND away_team_id IS NOT NULL`,
    )
    .all() as { id: number; h: string; a: string; startTs: number | null }[];
  const pairKey = (x: string, y: string) => [x, y].sort().join('__');

  // votes keyed by pair (oriented to the stored home/away)
  const voteRows = db
    .prepare(`SELECT match_id AS id, vote_home AS vh, vote_draw AS vd, vote_away AS va FROM ss_vote`)
    .all() as { id: number; vh: number; vd: number; va: number }[];
  const voteByMatch = new Map(voteRows.map((v) => [v.id, v]));

  const predRows = db
    .prepare(
      `SELECT match_id AS id, team_id AS teamId, side, formation, player_name AS name,
              position AS pos, jersey, substitute
       FROM ss_predicted_lineup_player WHERE confirmed=0 ORDER BY match_id, side, substitute`,
    )
    .all() as Array<{ id: number; teamId: string; side: string; formation: string; name: string; pos: string; jersey: string; substitute: number }>;

  // ---- Freeze step: snapshot the fan votes once a fixture passes KO-1h. ------
  // We keep a durable store keyed by pair. On each run, for any fixture whose
  // freeze line has passed and that we haven't already frozen, we capture the
  // current votes. After that the live ss_vote keeps updating but the published
  // export reads the FROZEN value, so the prediction is fixed at kick-off time.
  type VoteSnap = { home: number; draw: number; away: number; homeId: string; awayId: string; frozenAt: number };
  const snapshots: Record<string, VoteSnap> = existsSync(SNAPSHOT_PATH)
    ? JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
    : {};
  const now = Date.now();
  for (const m of ssMatches) {
    const key = pairKey(m.h, m.a);
    if (snapshots[key]) continue; // already frozen — never overwrite
    if (m.startTs == null) continue;
    const koMs = m.startTs * 1000;
    if (now < koMs - FREEZE_LEAD_MS) continue; // not yet within the freeze window
    const v = voteByMatch.get(m.id);
    if (!v) continue; // nothing to freeze
    snapshots[key] = { home: v.vh, draw: v.vd, away: v.va, homeId: m.h, awayId: m.a, frozenAt: now };
  }
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshots, null, 0));

  // ---- Bookmaker odds (API-Football), keyed by pair, oriented to home/away. --
  // af_odds rows are per AF fixture; join to af_fixture for our team slugs and
  // the kickoff, so odds freeze at KO-1h on the SAME rule as the votes.
  type OddsBook = { bookmaker: string; home: number; draw: number; away: number };
  type OddsEntry = { homeId: string; awayId: string; startTs: number | null; books: OddsBook[] };
  const oddsRows = db
    .prepare(
      `SELECT o.bookmaker AS bm, o.home_odd AS h, o.draw_odd AS d, o.away_odd AS a,
              f.home_team_id AS homeId, f.away_team_id AS awayId,
              CAST(strftime('%s', f.date) AS INTEGER) AS startTs
       FROM af_odds o JOIN af_fixture f ON f.id = o.fixture_id
       WHERE f.home_team_id IS NOT NULL AND f.away_team_id IS NOT NULL
         AND o.home_odd IS NOT NULL AND o.draw_odd IS NOT NULL AND o.away_odd IS NOT NULL`,
    )
    .all() as Array<{ bm: string; h: number; d: number; a: number; homeId: string; awayId: string; startTs: number | null }>;
  const liveOdds: Record<string, OddsEntry> = {};
  for (const r of oddsRows) {
    const key = pairKey(r.homeId, r.awayId);
    const e = (liveOdds[key] ??= { homeId: r.homeId, awayId: r.awayId, startTs: r.startTs, books: [] });
    // de-dup bookmaker (API can return repeats); keep the first price seen.
    if (e.books.some((b) => b.bookmaker === r.bm)) continue;
    e.books.push({ bookmaker: r.bm, home: r.h, draw: r.d, away: r.a });
  }

  type OddsSnap = OddsEntry & { frozenAt: number };
  const oddsSnapshots: Record<string, OddsSnap> = existsSync(ODDS_SNAPSHOT_PATH)
    ? JSON.parse(readFileSync(ODDS_SNAPSHOT_PATH, 'utf8'))
    : {};
  for (const [key, e] of Object.entries(liveOdds)) {
    if (oddsSnapshots[key]) continue; // already frozen
    if (e.startTs == null) continue;
    if (now < e.startTs * 1000 - FREEZE_LEAD_MS) continue; // not yet in the window
    if (!e.books.length) continue;
    oddsSnapshots[key] = { ...e, frozenAt: now };
  }
  writeFileSync(ODDS_SNAPSHOT_PATH, JSON.stringify(oddsSnapshots, null, 0));

  // odds-by-pair.json — frozen snapshot preferred, else live. Sorted by home
  // price (favourites' books first is irrelevant; site sorts/highlights).
  const oddsByPair: Record<string, any> = {};
  for (const key of new Set([...Object.keys(liveOdds), ...Object.keys(oddsSnapshots)])) {
    const snap = oddsSnapshots[key];
    const src = snap ?? liveOdds[key];
    if (!src || !src.books.length) continue;
    oddsByPair[key] = { homeId: src.homeId, awayId: src.awayId, frozen: !!snap, books: src.books };
  }
  write('odds-by-pair.json', oddsByPair);

  // injuries.json — injuries/suspensions grouped by team slug (writer-facing).
  const injRows = db
    .prepare(
      `SELECT team_id AS teamId, player_name AS name, type, reason, date, fixture_id AS fixtureId
       FROM af_injury WHERE team_id IS NOT NULL ORDER BY team_id, date`,
    )
    .all() as Array<{ teamId: string; name: string; type: string; reason: string; date: string; fixtureId: number }>;
  const injByTeam: Record<string, any[]> = {};
  for (const r of injRows) {
    (injByTeam[r.teamId] ??= []).push({ name: r.name, type: r.type, reason: r.reason, date: r.date, fixtureId: r.fixtureId });
  }
  write('injuries.json', injByTeam);

  // Assemble per-pair: { votes, frozen, lineups }. `votes` prefers the frozen
  // snapshot when present, so the site always renders the pre-match value.
  const ssByPair: Record<string, any> = {};
  for (const m of ssMatches) {
    const key = pairKey(m.h, m.a);
    const entry = (ssByPair[key] ??= { homeId: m.h, awayId: m.a, votes: null, frozen: false, lineups: {} });
    const snap = snapshots[key];
    if (snap) {
      entry.votes = { homeId: snap.homeId, awayId: snap.awayId, home: snap.home, draw: snap.draw, away: snap.away };
      entry.frozen = true;
    } else {
      const v = voteByMatch.get(m.id);
      if (v) entry.votes = { homeId: m.h, awayId: m.a, home: v.vh, draw: v.vd, away: v.va };
    }
  }
  for (const p of predRows) {
    const m = ssMatches.find((x) => x.id === p.id);
    if (!m || !p.teamId) continue;
    const entry = ssByPair[pairKey(m.h, m.a)];
    if (!entry) continue;
    const lu = (entry.lineups[p.teamId] ??= { formation: p.formation, starters: [], subs: [] });
    (p.substitute ? lu.subs : lu.starters).push({ name: p.name, pos: p.pos, jersey: p.jersey });
  }
  write('ss-by-pair.json', ssByPair);

  // af-lineups.json — the ACTUAL XIs that played, per finished AF fixture. Keyed
  // by AF fixture id → { <team_id>: { formation, coach, starters[], subs[] } },
  // matching the SsLineup shape so the pitch can render it. Finished matches show
  // this instead of the SofaScore predicted XI.
  const luRows = db
    .prepare(
      `SELECT l.fixture_id AS fid, l.team_id AS teamId, l.formation, l.coach,
              p.player_name AS name, p.number AS jersey, p.pos, p.starter
       FROM af_lineup l JOIN af_lineup_player p
         ON p.fixture_id = l.fixture_id AND p.af_team_id = l.af_team_id
       WHERE l.team_id IS NOT NULL
       ORDER BY l.fixture_id, l.team_id, p.starter DESC`,
    )
    .all() as Array<{ fid: number; teamId: string; formation: string; coach: string; name: string; jersey: number | null; pos: string; starter: number }>;
  const afLineups: Record<string, Record<string, any>> = {};
  for (const r of luRows) {
    const fx = (afLineups[r.fid] ??= {});
    const lu = (fx[r.teamId] ??= { formation: r.formation, coach: r.coach, starters: [], subs: [] });
    (r.starter ? lu.starters : lu.subs).push({ name: r.name, pos: r.pos, jersey: r.jersey == null ? null : String(r.jersey) });
  }
  write('af-lineups.json', afLineups);

  // af-match-detail.json — per finished AF fixture: key team stats (for the
  // comparison bars) + goals. Keyed by AF fixture id (matches af-fixtures.json).
  const STAT_KEYS = ['Ball Possession', 'Total Shots', 'Shots on Goal', 'expected_goals', 'Passes %', 'Corner Kicks'];
  const statRows = db
    .prepare(
      `SELECT fixture_id AS fid, team_id AS teamId, stat_type AS type, stat_value AS val
       FROM af_team_stat WHERE team_id IS NOT NULL`,
    )
    .all() as Array<{ fid: number; teamId: string; type: string; val: string }>;
  const goalRowsAf = db
    .prepare(
      `SELECT fixture_id AS fid, team_id AS teamId, player_name AS scorer, minute, detail
       FROM af_event WHERE type='Goal' AND team_id IS NOT NULL ORDER BY fixture_id, minute`,
    )
    .all() as Array<{ fid: number; teamId: string; scorer: string; minute: number; detail: string }>;

  const detail: Record<number, { stats: Record<string, Record<string, string>>; goals: Array<{ teamId: string; scorer: string; minute: number; pen: boolean }> }> = {};
  for (const r of statRows) {
    if (!STAT_KEYS.includes(r.type)) continue;
    const d = (detail[r.fid] ??= { stats: {}, goals: [] });
    (d.stats[r.type] ??= {})[r.teamId] = r.val;
  }
  for (const g of goalRowsAf) {
    const d = (detail[g.fid] ??= { stats: {}, goals: [] });
    d.goals.push({ teamId: g.teamId, scorer: g.scorer, minute: g.minute, pen: /penalty/i.test(g.detail) });
  }
  write('af-match-detail.json', detail);

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
      afFixtures: count('af_fixture'),
      teamMatchStats: count('af_team_stat'),
      matchEvents: count('af_event'),
      lineups: count('af_lineup'),
      playerMatchStats: count('af_player_stat'),
    },
  });

  db.close();
  console.log(`\nExported to ${EXPORT_DIR}`);
}

main();
