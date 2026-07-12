// D1-backed warehouse accessors — the SSR read path.
//
// Mirror of the functions in warehouse.ts, but querying Cloudflare D1 at request
// time instead of reading build-time JSON. The SQL here is the same SQL the
// pipeline's export.ts uses to produce the *.json slices, so the returned shapes
// are identical to the static accessors — pages that switch to SSR keep working
// with the same data, just fresher.
//
// Runtime only: `import { env } from 'cloudflare:workers'` resolves to the local
// miniflare D1 under `astro dev` and the real D1 binding in production. Never
// import this from a prerendered page — it must run on workerd, not at build.
//
// SHAPE CONTRACT: every accessor returns byte-identical data to warehouse.ts. We
// import the shared interfaces from ./warehouse (which only pulls TYPES, erased
// at compile time — the JSON imports there are not evaluated on this path) and
// re-implement the pure, data-free constants/helpers locally.
import { env } from 'cloudflare:workers';
import type {
  AfFixture,
  H2HRecord,
  MatchGoal,
  WarehouseMatch,
  SsLineup,
  SsPair,
  AfMatchDetail,
  OddsBook,
  OddsPair,
  PlayerWcStats,
  KnockoutInfo,
} from './warehouse';

// The D1 binding declared in wrangler.worker.toml ([[d1_databases]] binding = "DB").
const db = () => (env as { DB: D1Database }).DB;

// --- Pure constants/helpers (no JSON dependency — mirror warehouse.ts) --------
// These have no data dependency, so we re-implement them locally rather than
// importing (importing the runtime values would pull warehouse.ts's build-time
// JSON imports into the worker bundle).
export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
export const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
export function lifecycle(status: string): 'upcoming' | 'live' | 'ended' {
  if (FINISHED_STATUSES.has(status)) return 'ended';
  if (LIVE_STATUSES.has(status)) return 'live';
  return 'upcoming';
}
/** Short live label for a badge: "HT" at the break, else "Live · 46'". */
export function liveLabel(status: string, elapsed: number | null): string {
  if (status === 'HT') return 'HT';
  return elapsed ? `Live · ${elapsed}'` : 'Live';
}
/** The API-Football player id embedded in a photo URL (…/players/<id>.png), or null. */
export function afPlayerId(photo: string | null | undefined): string | null {
  const m = photo?.match(/\/players\/(\d+)\.png/);
  return m ? m[1] : null;
}

const KO_ORDER: Record<string, number> = { group: 0, r32: 1, r16: 2, qf: 3, sf: 4, final: 5 };
const KO_ALIVE: Record<string, string> = { qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final' };
const KO_OUT: Record<string, string> = { group: 'Eliminated', r32: 'Out · round of 32', r16: 'Out · last 16', qf: 'Out · quarter-finals', sf: 'Out · semi-finals' };

// A warehouse player row (as projected from the `player` join in export.ts). Kept
// local because warehouse.ts does not export this interface.
interface WarehousePlayer {
  id: string;
  teamId: string;
  name: string;
  position: string;
  club: string | null;
  clubTier: string | null;
  playerTier: string | null;
  photo: string | null;
}

// Shared projection — matches export.ts's af-fixtures.json column aliasing exactly.
const AF_FIXTURE_COLS = `
  id, date, status_short AS status, elapsed, stage, round, venue, city,
  home_team_id AS homeTeamId, away_team_id AS awayTeamId,
  home_score AS homeScore, away_score AS awayScore`;

const pairKey = (x: string, y: string) => [x, y].sort().join('__');

// ---------------------------------------------------------------------------
// Standalone async exports — kept for /today, which already awaits these.
// They also get re-exposed via loadWarehouse() below.
// ---------------------------------------------------------------------------

/** Most recent FINISHED matches from the live AF feed, newest first. */
export async function getRecentResults(limit = 6): Promise<AfFixture[]> {
  const { results } = await db()
    .prepare(
      `SELECT ${AF_FIXTURE_COLS}
       FROM af_fixture
       WHERE home_team_id IS NOT NULL AND away_team_id IS NOT NULL AND status_short = 'FT'
       ORDER BY date DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<AfFixture>();
  return results ?? [];
}

/** Upcoming (not-started) AF fixtures, soonest first. */
export async function getUpcomingFixtures(limit = 8): Promise<AfFixture[]> {
  const { results } = await db()
    .prepare(
      `SELECT ${AF_FIXTURE_COLS}
       FROM af_fixture
       WHERE home_team_id IS NOT NULL AND away_team_id IS NOT NULL AND status_short = 'NS'
       ORDER BY date ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<AfFixture>();
  return results ?? [];
}

// ---------------------------------------------------------------------------
// loadWarehouse() — run the handful of D1 queries ONCE per request, build the
// same in-memory maps warehouse.ts holds at module load, and return an object of
// SYNCHRONOUS accessors closured over that loaded data. This mirrors D1's
// strength (few queries per request) and lets call sites stay synchronous after
// a single `const wh = await loadWarehouse()`.
// ---------------------------------------------------------------------------

// Raw row shapes as returned by each query (pre-transform).
interface PlayerRow {
  id: string; teamId: string; name: string; position: string;
  club: string | null; clubTier: string | null; playerTier: string | null; photo: string | null;
}
interface H2HRow {
  a: string; b: string; played: number; aWins: number; draws: number; bWins: number;
  aGoals: number; bGoals: number; lastMeeting: string | null;
  lastAScore: number | null; lastBScore: number | null;
}
interface PStatRow {
  afId: string; fixtureId: number; minutes: number | null; rating: string | null;
  goals: number | null; assists: number | null; shots: number | null; shotsOn: number | null;
  passes: number | null; passAccuracy: number | null; yellow: number | null; red: number | null;
  homeId: string; awayId: string; homeScore: number | null; awayScore: number | null;
  stage: string; date: string;
}
interface SsMatchRow { id: number; h: string; a: string }
interface VoteRow { id: number; vh: number; vd: number; va: number }
interface PredRow {
  id: number; teamId: string | null; side: string; formation: string | null;
  name: string; pos: string | null; jersey: string | null; substitute: number;
}
interface OddsRow {
  bm: string; h: number; d: number; a: number; homeId: string; awayId: string;
}
interface VoteSnapRow {
  key: string; homeId: string; awayId: string; vh: number; vd: number; va: number;
}
interface OddsSnapRow {
  key: string; homeId: string; awayId: string; bm: string; h: number; d: number; a: number;
}
interface LineupRow {
  fid: number; teamId: string; formation: string | null; coach: string | null;
  name: string; jersey: number | null; pos: string | null; starter: number;
}
interface TeamStatRow { fid: number; teamId: string; type: string; val: string }
interface AfGoalRow { fid: number; teamId: string; scorer: string; minute: number; detail: string | null }
interface MatchGoalRow { matchId: string; side: string; teamId: string | null; scorer: string; minute: string; penalty: number }

const STAT_KEYS = ['Ball Possession', 'Total Shots', 'Shots on Goal', 'expected_goals', 'Passes %', 'Corner Kicks'];

export interface Warehouse {
  getH2H: (teamA: string, teamB: string) => H2HRecord | null;
  getPlayerTiers: (playerId: string) => {
    clubTier: string | null; playerTier: string | null; club: string | null; photo: string | null;
  } | null;
  getTeamPlayers: (teamId: string) => WarehousePlayer[];
  getH2HByTeam: () => Record<string, Record<string, H2HRecord>>;
  getMatchGoals: (matchId: string) => MatchGoal[];
  getWarehouseMatches: () => WarehouseMatch[];
  getAfFixtures: () => AfFixture[];
  getRecentResults: (limit?: number) => AfFixture[];
  getUpcomingFixtures: (limit?: number) => AfFixture[];
  getSsPair: (a: string, b: string) => SsPair | null;
  getMatchDetail: (fixtureId: number) => AfMatchDetail | null;
  getSsPairKeys: () => string[];
  getOddsPair: (a: string, b: string) => OddsPair | null;
  getPlayerWcStats: (afId: string | null) => PlayerWcStats | null;
  getActualLineups: (fixtureId: number) => Record<string, SsLineup & { coach?: string }> | null;
  getKnockoutStatus: () => Record<string, KnockoutInfo>;
  lifecycle: typeof lifecycle;
  liveLabel: typeof liveLabel;
  afPlayerId: typeof afPlayerId;
  FINISHED_STATUSES: typeof FINISHED_STATUSES;
  LIVE_STATUSES: typeof LIVE_STATUSES;
}

export async function loadWarehouse(): Promise<Warehouse> {
  const d = db();

  // Batch the independent SELECTs into one round trip. Each statement's result
  // is a { results } object, in the same order we passed them.
  const [
    playersRes,
    h2hRes,
    matchGoalsRes,
    wcMatchesRes,
    afFixturesRes,
    ssMatchesRes,
    voteRes,
    predRes,
    oddsRes,
    voteSnapRes,
    oddsSnapRes,
    lineupRes,
    teamStatRes,
    afGoalRes,
    pStatRes,
  ] = await d.batch([
    // players.json projection
    d.prepare(
      `SELECT p.id, p.team_id AS teamId, p.name, p.position, p.photo,
              c.name AS club, ct.tier_label AS clubTier, pt.tier_label AS playerTier
       FROM player p
       LEFT JOIN club c ON p.club_id = c.id
       LEFT JOIN club_tier ct ON c.id = ct.club_id
       LEFT JOIN player_tier pt ON p.id = pt.player_id
       ORDER BY p.team_id, p.position`,
    ),
    // h2h.json + h2h-by-team.json (both derived from the same rows)
    d.prepare(
      `SELECT team_a AS a, team_b AS b, played, a_wins AS aWins, draws, b_wins AS bWins,
              a_goals AS aGoals, b_goals AS bGoals, last_meeting AS lastMeeting,
              last_a_score AS lastAScore, last_b_score AS lastBScore FROM h2h`,
    ),
    // match-goals.json
    d.prepare(
      `SELECT match_id AS matchId, side, team_id AS teamId, scorer, minute, penalty
       FROM match_goal ORDER BY match_id, CAST(minute AS INTEGER)`,
    ),
    // wc-matches.json
    d.prepare(
      `SELECT id, stage, group_letter AS groupLetter, kickoff, venue, city,
              home_team_id AS homeTeamId, away_team_id AS awayTeamId,
              home_score AS homeScore, away_score AS awayScore, status
       FROM wc_match`,
    ),
    // af-fixtures.json
    d.prepare(
      `SELECT ${AF_FIXTURE_COLS}
       FROM af_fixture
       WHERE home_team_id IS NOT NULL AND away_team_id IS NOT NULL
       ORDER BY date`,
    ),
    // ss_match (pairing spine for votes + predicted lineups)
    d.prepare(
      `SELECT id, home_team_id AS h, away_team_id AS a FROM ss_match
       WHERE home_team_id IS NOT NULL AND away_team_id IS NOT NULL`,
    ),
    // ss_vote
    d.prepare(`SELECT match_id AS id, vote_home AS vh, vote_draw AS vd, vote_away AS va FROM ss_vote`),
    // ss predicted lineups
    d.prepare(
      `SELECT match_id AS id, team_id AS teamId, side, formation, player_name AS name,
              position AS pos, jersey, substitute
       FROM ss_predicted_lineup_player WHERE confirmed=0 ORDER BY match_id, side, substitute`,
    ),
    // odds-by-pair.json (live rows; frozen snapshot preferred when present)
    d.prepare(
      `SELECT o.bookmaker AS bm, o.home_odd AS h, o.draw_odd AS d, o.away_odd AS a,
              f.home_team_id AS homeId, f.away_team_id AS awayId
       FROM af_odds o JOIN af_fixture f ON f.id = o.fixture_id
       WHERE f.home_team_id IS NOT NULL AND f.away_team_id IS NOT NULL
         AND o.home_odd IS NOT NULL AND o.draw_odd IS NOT NULL AND o.away_odd IS NOT NULL`,
    ),
    // vote_snapshot — the KO−1h frozen fan vote per pair (pipeline writes it to D1).
    d.prepare(
      `SELECT pair_key AS key, home_id AS homeId, away_id AS awayId,
              vote_home AS vh, vote_draw AS vd, vote_away AS va FROM vote_snapshot`,
    ),
    // odds_snapshot — the KO−1h frozen bookmaker odds (one row per book per pair).
    d.prepare(
      `SELECT pair_key AS key, home_id AS homeId, away_id AS awayId,
              bookmaker AS bm, home_odd AS h, draw_odd AS d, away_odd AS a FROM odds_snapshot`,
    ),
    // af-lineups.json (actual XIs)
    d.prepare(
      `SELECT l.fixture_id AS fid, l.team_id AS teamId, l.formation, l.coach,
              p.player_name AS name, p.number AS jersey, p.pos, p.starter
       FROM af_lineup l JOIN af_lineup_player p
         ON p.fixture_id = l.fixture_id AND p.af_team_id = l.af_team_id
       WHERE l.team_id IS NOT NULL
       ORDER BY l.fixture_id, l.team_id, p.starter DESC`,
    ),
    // af-match-detail.json: team stats
    d.prepare(
      `SELECT fixture_id AS fid, team_id AS teamId, stat_type AS type, stat_value AS val
       FROM af_team_stat WHERE team_id IS NOT NULL`,
    ),
    // af-match-detail.json: goals
    d.prepare(
      `SELECT fixture_id AS fid, team_id AS teamId, player_name AS scorer, minute, detail
       FROM af_event WHERE type='Goal' AND team_id IS NOT NULL ORDER BY fixture_id, minute`,
    ),
    // player-wc-stats.json
    d.prepare(
      `SELECT ps.player_id AS afId, ps.fixture_id AS fixtureId,
              ps.minutes, ps.rating, ps.goals, ps.assists, ps.shots, ps.shots_on AS shotsOn,
              ps.passes, ps.pass_accuracy AS passAccuracy, ps.yellow, ps.red,
              f.home_team_id AS homeId, f.away_team_id AS awayId,
              f.home_score AS homeScore, f.away_score AS awayScore, f.stage, f.date
       FROM af_player_stat ps JOIN af_fixture f ON f.id = ps.fixture_id
       WHERE ps.player_id IS NOT NULL
       ORDER BY f.date`,
    ),
  ]);

  // ---- players → playerById + team lists --------------------------------
  const players = ((playersRes.results ?? []) as PlayerRow[]).map<WarehousePlayer>((r) => ({
    id: r.id, teamId: r.teamId, name: r.name, position: r.position,
    club: r.club, clubTier: r.clubTier, playerTier: r.playerTier, photo: r.photo,
  }));
  const playerById = new Map(players.map((p) => [p.id, p]));

  // ---- h2h → flat map + per-team map ------------------------------------
  const h2h: Record<string, H2HRecord> = {};
  const h2hByTeam: Record<string, Record<string, H2HRecord>> = {};
  for (const r of (h2hRes.results ?? []) as H2HRow[]) {
    const rec: H2HRecord = {
      played: r.played, aWins: r.aWins, draws: r.draws, bWins: r.bWins,
      aGoals: r.aGoals, bGoals: r.bGoals, lastMeeting: r.lastMeeting as string,
      lastAScore: r.lastAScore, lastBScore: r.lastBScore,
    };
    h2h[`${r.a}__${r.b}`] = rec;
    (h2hByTeam[r.a] ??= {})[r.b] = rec;
  }

  // ---- match goals (wc) -------------------------------------------------
  const matchGoals: Record<string, MatchGoal[]> = {};
  for (const g of (matchGoalsRes.results ?? []) as MatchGoalRow[]) {
    (matchGoals[g.matchId] ??= []).push({
      side: g.side as 'home' | 'away', teamId: g.teamId, scorer: g.scorer,
      minute: g.minute, penalty: g.penalty === 1,
    });
  }

  // ---- wc matches -------------------------------------------------------
  const wcMatches = (wcMatchesRes.results ?? []) as WarehouseMatch[];

  // ---- af fixtures ------------------------------------------------------
  const afFixtures = (afFixturesRes.results ?? []) as AfFixture[];

  // ---- ss pairs: votes + predicted lineups ------------------------------
  const ssMatches = (ssMatchesRes.results ?? []) as SsMatchRow[];
  const voteByMatch = new Map(
    ((voteRes.results ?? []) as VoteRow[]).map((v) => [v.id, v]),
  );
  // KO−1h frozen vote snapshots (pipeline writes them to D1), keyed by pair.
  const voteSnapByKey = new Map(
    ((voteSnapRes.results ?? []) as VoteSnapRow[]).map((s) => [s.key, s]),
  );
  const ssByPair: Record<string, SsPair> = {};
  for (const m of ssMatches) {
    const key = pairKey(m.h, m.a);
    const entry = (ssByPair[key] ??= { homeId: m.h, awayId: m.a, votes: null, frozen: false, lineups: {} });
    // Frozen snapshot preferred (matches export.ts): once a fixture passes KO−1h
    // the pipeline captures the vote, so the site always shows the pre-match value.
    const snap = voteSnapByKey.get(key);
    if (snap) {
      entry.frozen = true;
      entry.votes = { homeId: snap.homeId, awayId: snap.awayId, home: snap.vh, draw: snap.vd, away: snap.va };
    } else {
      const v = voteByMatch.get(m.id);
      if (v) entry.votes = { homeId: m.h, awayId: m.a, home: v.vh, draw: v.vd, away: v.va };
    }
  }
  for (const p of (predRes.results ?? []) as PredRow[]) {
    const m = ssMatches.find((x) => x.id === p.id);
    if (!m || !p.teamId) continue;
    const entry = ssByPair[pairKey(m.h, m.a)];
    if (!entry) continue;
    const lu = (entry.lineups[p.teamId] ??= { formation: p.formation, starters: [], subs: [] });
    (p.substitute ? lu.subs : lu.starters).push({ name: p.name, pos: p.pos, jersey: p.jersey });
  }

  // ---- odds by pair -----------------------------------------------------
  // Frozen snapshot preferred (matches export.ts): if a pair has a KO−1h odds
  // snapshot we serve THAT (frozen:true) and ignore the live price entirely;
  // otherwise we build from the live af_odds rows (frozen:false).
  const oddsSnapByKey = new Map<string, OddsPair>();
  for (const r of (oddsSnapRes.results ?? []) as OddsSnapRow[]) {
    const e = oddsSnapByKey.get(r.key)
      ?? { homeId: r.homeId, awayId: r.awayId, frozen: true, books: [] as OddsBook[] };
    if (!e.books.some((b) => b.bookmaker === r.bm)) {
      e.books.push({ bookmaker: r.bm, home: r.h, draw: r.d, away: r.a });
    }
    oddsSnapByKey.set(r.key, e);
  }
  const oddsByPair: Record<string, OddsPair> = {};
  for (const r of (oddsRes.results ?? []) as OddsRow[]) {
    const key = pairKey(r.homeId, r.awayId);
    if (oddsSnapByKey.has(key)) continue; // frozen snapshot wins — skip live rows
    const e = (oddsByPair[key] ??= { homeId: r.homeId, awayId: r.awayId, frozen: false, books: [] as OddsBook[] });
    // de-dup bookmaker (API can return repeats); keep the first price seen.
    if (e.books.some((b) => b.bookmaker === r.bm)) continue;
    e.books.push({ bookmaker: r.bm, home: r.h, draw: r.d, away: r.a });
  }
  // Layer the frozen snapshots on top (they take precedence).
  for (const [key, e] of oddsSnapByKey) oddsByPair[key] = e;
  // Drop any pair that ended up with no books (matches export.ts's guard).
  for (const key of Object.keys(oddsByPair)) {
    if (!oddsByPair[key].books.length) delete oddsByPair[key];
  }

  // ---- actual lineups (af) ----------------------------------------------
  const afLineups: Record<string, Record<string, SsLineup & { coach?: string }>> = {};
  for (const r of (lineupRes.results ?? []) as LineupRow[]) {
    const fx = (afLineups[String(r.fid)] ??= {});
    const lu = (fx[r.teamId] ??= { formation: r.formation, coach: r.coach ?? undefined, starters: [], subs: [] });
    (r.starter ? lu.starters : lu.subs).push({
      name: r.name, pos: r.pos, jersey: r.jersey == null ? null : String(r.jersey),
    });
  }

  // ---- af match detail (stats + goals) ----------------------------------
  const afMatchDetail: Record<string, AfMatchDetail> = {};
  for (const r of (teamStatRes.results ?? []) as TeamStatRow[]) {
    if (!STAT_KEYS.includes(r.type)) continue;
    const dd = (afMatchDetail[String(r.fid)] ??= { stats: {}, goals: [] });
    (dd.stats[r.type] ??= {})[r.teamId] = r.val;
  }
  for (const g of (afGoalRes.results ?? []) as AfGoalRow[]) {
    const dd = (afMatchDetail[String(g.fid)] ??= { stats: {}, goals: [] });
    dd.goals.push({ teamId: g.teamId, scorer: g.scorer, minute: g.minute, pen: /penalty/i.test(g.detail ?? '') });
  }

  // ---- player WC stats --------------------------------------------------
  const playerWcStats: Record<string, PlayerWcStats> = {};
  for (const r of (pStatRes.results ?? []) as PStatRow[]) {
    const e = (playerWcStats[r.afId] ??= { apps: 0, mins: 0, goals: 0, assists: 0, matches: [] });
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

  // ---- synchronous accessors closured over the loaded data ---------------
  return {
    getH2H: (teamA, teamB) => h2h[`${teamA}__${teamB}`] ?? null,

    getPlayerTiers: (playerId) => {
      const p = playerById.get(playerId);
      if (!p) return null;
      return { clubTier: p.clubTier, playerTier: p.playerTier, club: p.club, photo: p.photo };
    },

    getTeamPlayers: (teamId) => players.filter((p) => p.teamId === teamId),

    getH2HByTeam: () => h2hByTeam,

    getMatchGoals: (matchId) => matchGoals[matchId] ?? [],

    getWarehouseMatches: () => wcMatches,

    getAfFixtures: () => afFixtures,

    getRecentResults: (limit = 6) =>
      afFixtures
        .filter((m) => m.status === 'FT')
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, limit),

    getUpcomingFixtures: (limit = 8) =>
      afFixtures
        .filter((m) => m.status === 'NS')
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(0, limit),

    getSsPair: (a, b) => ssByPair[pairKey(a, b)] ?? null,

    getMatchDetail: (fixtureId) => afMatchDetail[String(fixtureId)] ?? null,

    getSsPairKeys: () => Object.keys(ssByPair),

    getOddsPair: (a, b) => oddsByPair[pairKey(a, b)] ?? null,

    getPlayerWcStats: (afId) => (afId ? playerWcStats[afId] ?? null : null),

    getActualLineups: (fixtureId) => afLineups[String(fixtureId)] ?? null,

    getKnockoutStatus: () => {
      const by: Record<string, { played: Set<string>; upcoming: Set<string> }> = {};
      for (const m of afFixtures) {
        const ended = FINISHED_STATUSES.has(m.status);
        for (const id of [m.homeTeamId, m.awayTeamId]) {
          const b = (by[id] ??= { played: new Set<string>(), upcoming: new Set<string>() });
          (ended ? b.played : b.upcoming).add(m.stage);
        }
      }
      const out: Record<string, KnockoutInfo> = {};
      for (const [id, b] of Object.entries(by)) {
        const next = [...b.upcoming].sort((a, c) => KO_ORDER[a] - KO_ORDER[c]);
        if (next.length) {
          out[id] = { alive: true, stage: next[0], label: KO_ALIVE[next[0]] ?? 'Still alive' };
        } else {
          const exit = [...b.played].sort((a, c) => KO_ORDER[c] - KO_ORDER[a])[0] ?? 'group';
          out[id] = { alive: false, stage: exit, label: KO_OUT[exit] ?? 'Eliminated' };
        }
      }
      return out;
    },

    lifecycle,
    liveLabel,
    afPlayerId,
    FINISHED_STATUSES,
    LIVE_STATUSES,
  };
}
