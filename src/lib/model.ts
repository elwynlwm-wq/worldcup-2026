// The forecast model + derived database, ported from the original prototype.
//
// `predict()` is a transparent heuristic: an Elo expected score on an adjusted
// rating (Elo + tournament form + squad attack + host advantage), plus a draw
// term that shrinks as the rating gap grows. Not betting advice. Keep it
// explainable — if you change the weighting, note it in the commit (see AGENTS.md).
//
// `buildDb()` turns the raw seed data into the shape the pages consume. The
// SampleProvider exposes it behind the FootballDataProvider interface so the
// data plane can later swap in a backend without changing the pages.
// See docs/architecture.md and docs/data-model.md.

import { GROUPS, REAL_R32, REAL_RESULTS, SQUADS_RAW, RATINGS } from '../data/raw';

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export interface Player {
  id: string;
  teamId: string;
  pos: string;
  name: string;
  age: number;
  caps: number;
  goals: number;
  club: string;
}

export interface Team {
  id: string;
  name: string;
  shortCode: string;
  confederation: string;
  groupId: string;
  groupLetter: string;
  coachName: string | null;
  points: number;
  goalDifference: number;
  status: string;
  rank: number;
  elo: number;
  fifaRank: number;
  formAdj: number;
  squadAdj: number;
  hostAdj: number;
  adjRating: number;
  squadCaps: number;
  squadGoals: number;
  qualified: boolean;
  knockoutStatus: 'eliminated' | 'r32' | 'tbc';
  strength: number;
}

export interface GroupStanding {
  teamId: string;
  rank: number;
  points: number;
  goalDifference: number;
  status: string;
}

export interface Group {
  id: string;
  name: string;
  letter: string;
  standings: GroupStanding[];
}

export interface Match {
  id: string;
  stage: 'group' | 'r32';
  groupId: string | null;
  kickoff: string;
  venue: string | null;
  city: string | null;
  status: 'finished' | 'scheduled';
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface Prediction {
  win: number;
  draw: number;
  lose: number;
  d: number;
}

/** Elo expected score for a rating difference. */
export function expScore(d: number): number {
  return 1 / (1 + Math.pow(10, -d / 400));
}

/** Win/draw/lose probabilities for team a vs team b, normalised to sum to 1. */
export function predict(a: Team, b: Team): Prediction {
  const d = a.adjRating - b.adjRating;
  const E = expScore(d);
  const draw = 0.28 * Math.exp(-Math.abs(d) / 220);
  let win = E - draw / 2;
  let lose = 1 - win - draw;
  if (win < 0.01) win = 0.01;
  if (lose < 0.01) lose = 0.01;
  const s = win + draw + lose;
  return { win: win / s, draw: draw / s, lose: lose / s, d };
}

export interface Tournament {
  name: string;
  year: number;
  hosts: string[];
  startDate: string;
  endDate: string;
  currentStage: string;
  numTeams: number;
  format: {
    numGroups: number;
    teamsPerGroup: number;
    qualifyPerGroup: number;
    bestThirdPlaceQualifiers: number;
  };
}

export interface Db {
  teams: Team[];
  byId: Record<string, Team>;
  byName: Record<string, Team>;
  groups: Group[];
  coaches: Record<string, string>;
  squads: Record<string, Player[]>;
  matches: Match[];
  r32: Match[];
  tournament: Tournament;
}

const HOSTS = ['united-states', 'canada', 'mexico'];

export function buildDb(): Db {
  const coaches: Record<string, string> = {};
  const squads: Record<string, Player[]> = {};
  SQUADS_RAW.forEach(([team, coach, players]) => {
    const id = slug(team);
    coaches[id] = coach;
    squads[id] = players.map((p, i) => ({
      id: `${id}-${i}`,
      teamId: id,
      pos: p[0],
      name: p[1],
      age: p[2],
      caps: p[3],
      goals: p[4],
      club: p[5],
    }));
  });

  // Squad-attack baseline: how a team's total international goals compares to
  // the field (z-score), clamped, contributing a small rating bump.
  const aggMap: Record<string, { caps: number; goals: number }> = {};
  const goalTotals: number[] = [];
  Object.keys(squads).forEach((id) => {
    const sq = squads[id];
    const caps = sq.reduce((s, p) => s + p.caps, 0);
    const goals = sq.reduce((s, p) => s + p.goals, 0);
    aggMap[id] = { caps, goals };
    goalTotals.push(goals);
  });
  const avgGoals = goalTotals.reduce((s, x) => s + x, 0) / goalTotals.length;
  const sdGoals =
    Math.sqrt(goalTotals.reduce((s, x) => s + (x - avgGoals) ** 2, 0) / goalTotals.length) || 1;

  const teams: Team[] = [];
  const byId: Record<string, Team> = {};
  const byName: Record<string, Team> = {};

  const groups: Group[] = Object.keys(GROUPS).map((letter) => {
    const standings = GROUPS[letter].map((row, i): GroupStanding => {
      const [name, code, conf, pts, gd, status] = row;
      const id = slug(name);
      const [elo, fifaRank] = RATINGS[id] || [1600, 99];
      const agg = aggMap[id] || { caps: 0, goals: 0 };
      const formAdj = Math.round(Math.max(-35, Math.min(35, (pts - 4.5) * 5 + gd * 2)));
      const squadAdj = Math.round(
        Math.max(-20, Math.min(20, ((agg.goals - avgGoals) / sdGoals) * 10)),
      );
      const hostAdj = HOSTS.includes(id) ? 40 : 0;
      const adjRating = elo + formAdj + squadAdj + hostAdj;
      const qualified = ['winner', 'runner_up', 'best_third'].includes(status);
      const team: Team = {
        id,
        name,
        shortCode: code,
        confederation: conf,
        groupId: 'group-' + letter.toLowerCase(),
        groupLetter: letter,
        coachName: coaches[id] || null,
        points: pts,
        goalDifference: gd,
        status,
        rank: i + 1,
        elo,
        fifaRank,
        formAdj,
        squadAdj,
        hostAdj,
        adjRating,
        squadCaps: agg.caps,
        squadGoals: agg.goals,
        qualified,
        knockoutStatus: status === 'eliminated' ? 'eliminated' : qualified ? 'r32' : 'tbc',
        strength: 0, // filled below once min/max known
      };
      teams.push(team);
      byId[id] = team;
      byName[name] = team;
      return { teamId: id, rank: i + 1, points: pts, goalDifference: gd, status };
    });
    return { id: 'group-' + letter.toLowerCase(), name: 'Group ' + letter, letter, standings };
  });

  // Normalise adjusted rating to a 0–100 "strength" for display.
  const ar = teams.map((t) => t.adjRating);
  const mn = Math.min(...ar);
  const mx = Math.max(...ar);
  teams.forEach((t) => {
    t.strength = Math.round(((t.adjRating - mn) / (mx - mn)) * 100);
  });

  const matches: Match[] = [];
  REAL_RESULTS.forEach((row, i) => {
    const [g, hn, an, hs, as] = row;
    const h = byName[hn];
    const a = byName[an];
    if (!h || !a) return;
    matches.push({
      id: 'gm-' + i,
      stage: 'group',
      groupId: 'group-' + g.toLowerCase(),
      kickoff: '2026-06',
      venue: null,
      city: null,
      status: 'finished',
      homeTeamId: h.id,
      awayTeamId: a.id,
      homeScore: hs,
      awayScore: as,
    });
  });
  const r32: Match[] = REAL_R32.map((row, i) => {
    const [hn, an, date, venue, city] = row;
    const h = byName[hn];
    const a = byName[an];
    return {
      id: 'r32-' + i,
      stage: 'r32',
      groupId: null,
      kickoff: date + 'T15:00',
      venue,
      city,
      status: 'scheduled',
      homeTeamId: h.id,
      awayTeamId: a.id,
      homeScore: null,
      awayScore: null,
    };
  });
  matches.push(...r32);

  return {
    teams,
    byId,
    byName,
    groups,
    coaches,
    squads,
    matches,
    r32,
    tournament: {
      name: 'FIFA World Cup 2026',
      year: 2026,
      hosts: ['United States', 'Canada', 'Mexico'],
      startDate: '2026-06-11',
      endDate: '2026-07-19',
      currentStage: 'qf',
      numTeams: 48,
      format: { numGroups: 12, teamsPerGroup: 4, qualifyPerGroup: 2, bestThirdPlaceQualifiers: 8 },
    },
  };
}
