// openfootball/worldcup.json fetcher — WC2026 fixtures & structure (CC0).
// Shape: { name, matches: [{ round, date, time, team1, team2,
//          score:{ft:[h,a],ht:[..]}, group, ground }] }.
// Uses full team names ("Czech Republic" vs our "Czechia"), so names are mapped
// to our slugs via an alias map during the build. Reliable for structure/schedule;
// NOT a live feed (results lag). Keyless.

import { fetchCached } from '../lib/util';

export interface OfGoal {
  name: string;
  minute: string;
  penalty: boolean;
}

export interface OfMatch {
  round: string;
  date: string;
  time: string | null;
  team1: string;
  team2: string;
  ftHome: number | null;
  ftAway: number | null;
  group: string | null;
  ground: string | null;
  goals1: OfGoal[];
  goals2: OfGoal[];
}

const URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

export async function fetchOpenfootball(): Promise<OfMatch[]> {
  const text = await fetchCached(URL, 'openfootball-2026.json');
  type RawGoal = { name?: string; minute?: string | number; penalty?: boolean };
  const data = JSON.parse(text) as {
    matches: Array<{
      round?: string;
      date?: string;
      time?: string;
      team1?: string;
      team2?: string;
      score?: { ft?: [number, number] };
      group?: string;
      ground?: string;
      goals1?: RawGoal[];
      goals2?: RawGoal[];
    }>;
  };
  const mapGoals = (g?: RawGoal[]): OfGoal[] =>
    (g || []).map((x) => ({
      name: (x.name || '').trim(),
      minute: String(x.minute ?? ''),
      penalty: !!x.penalty,
    }));
  return (data.matches || []).map((m) => ({
    round: m.round || '',
    date: m.date || '',
    time: m.time || null,
    team1: (m.team1 || '').trim(),
    team2: (m.team2 || '').trim(),
    ftHome: m.score?.ft ? m.score.ft[0] : null,
    ftAway: m.score?.ft ? m.score.ft[1] : null,
    group: m.group || null,
    ground: m.ground || null,
    goals1: mapGoals(m.goals1),
    goals2: mapGoals(m.goals2),
  }));
}
