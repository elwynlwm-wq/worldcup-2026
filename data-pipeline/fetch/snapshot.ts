// Snapshot "fetcher" — the roster base for v1.
// Reads the verified squad/ratings snapshot that already lives in the Astro app
// (src/data/raw.ts). No network. This is the source of teams, players, coaches,
// WC matches, and Elo/FIFA ratings. See V1-PLAN.md.

import { GROUPS, RATINGS, SQUADS_RAW, REAL_RESULTS, REAL_R32 } from '../../src/data/raw';
import { slug } from '../lib/util';

export interface SnapTeam {
  id: string;
  name: string;
  shortCode: string;
  confederation: string;
  groupLetter: string;
  coachName: string | null;
  elo: number | null;
  fifaRank: number | null;
  points: number;
  goalDiff: number;
  status: string;
}
export interface SnapPlayer {
  id: string;
  teamId: string;
  name: string;
  position: string;
  age: number;
  caps: number;
  goals: number;
  club: string; // raw club name; linked to club table during build
}
export interface SnapMatch {
  id: string;
  stage: string;
  groupLetter: string | null;
  kickoff: string | null;
  venue: string | null;
  city: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export interface Snapshot {
  teams: SnapTeam[];
  players: SnapPlayer[];
  matches: SnapMatch[];
}

export function loadSnapshot(): Snapshot {
  const coaches: Record<string, string> = {};
  const players: SnapPlayer[] = [];
  SQUADS_RAW.forEach(([team, coach, roster]) => {
    const id = slug(team);
    coaches[id] = coach;
    roster.forEach((p, i) => {
      players.push({
        id: `${id}-${i}`,
        teamId: id,
        name: p[1],
        position: p[0],
        age: p[2],
        caps: p[3],
        goals: p[4],
        club: p[5],
      });
    });
  });

  const teams: SnapTeam[] = [];
  const byName: Record<string, string> = {};
  for (const letter of Object.keys(GROUPS)) {
    GROUPS[letter].forEach((row) => {
      const [name, code, conf, pts, gd, status] = row;
      const id = slug(name);
      const [elo, fifaRank] = RATINGS[id] || [null, null];
      teams.push({
        id,
        name,
        shortCode: code,
        confederation: conf,
        groupLetter: letter,
        coachName: coaches[id] || null,
        elo,
        fifaRank,
        points: pts,
        goalDiff: gd,
        status,
      });
      byName[name] = id;
    });
  }

  const matches: SnapMatch[] = [];
  REAL_RESULTS.forEach((row, i) => {
    const [g, hn, an, hs, as] = row;
    const h = byName[hn];
    const a = byName[an];
    if (!h || !a) return;
    matches.push({
      id: 'gm-' + i,
      stage: 'group',
      groupLetter: g,
      kickoff: '2026-06',
      venue: null,
      city: null,
      homeTeamId: h,
      awayTeamId: a,
      homeScore: hs,
      awayScore: as,
      status: 'finished',
    });
  });
  REAL_R32.forEach((row, i) => {
    const [hn, an, date, venue, city] = row;
    const h = byName[hn];
    const a = byName[an];
    if (!h || !a) return;
    matches.push({
      id: 'r32-' + i,
      stage: 'r32',
      groupLetter: null,
      kickoff: date + 'T15:00',
      venue,
      city,
      homeTeamId: h,
      awayTeamId: a,
      homeScore: null,
      awayScore: null,
      status: 'scheduled',
    });
  });

  return { teams, players, matches };
}
