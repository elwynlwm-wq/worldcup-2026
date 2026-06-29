// martj42/international_results fetcher — all-time international match results.
// A single CSV (~48k rows, 1872–present) of every international men's match.
// Powers full all-time head-to-head. Keyless, public (GitHub raw).
// Caveat: predecessor/renamed states (USSR, Yugoslavia, etc.) appear under
// historical names; v1 maps current WC nations and notes the rest as a limitation.

import { fetchCached, parseCsv } from '../lib/util';

export interface IntlResultRow {
  date: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  tournament: string;
  neutral: boolean;
}

const URL =
  'https://raw.githubusercontent.com/martj42/international_results/master/results.csv';

export async function fetchIntlResults(): Promise<IntlResultRow[]> {
  const text = await fetchCached(URL, 'international_results.csv');
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col('date');
  const iHome = col('home_team');
  const iAway = col('away_team');
  const iHS = col('home_score');
  const iAS = col('away_score');
  const iTour = col('tournament');
  const iNeutral = col('neutral');

  const out: IntlResultRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const hs = parseInt(row[iHS], 10);
    const as = parseInt(row[iAS], 10);
    if (Number.isNaN(hs) || Number.isNaN(as)) continue; // skip unplayed/awarded
    out.push({
      date: row[iDate],
      homeName: row[iHome].trim(),
      awayName: row[iAway].trim(),
      homeScore: hs,
      awayScore: as,
      tournament: iTour >= 0 ? row[iTour].trim() : '',
      neutral: iNeutral >= 0 ? row[iNeutral].trim().toLowerCase() === 'true' : false,
    });
  }
  return out;
}
