// clubelo.com fetcher — club strength ratings.
// api.clubelo.com/YYYY-MM-DD returns a CSV of EVERY ranked club's Elo on that
// date (one request, all clubs). We match these to our players' club names
// during the build to derive club tiers. Keyless, public.
// Coverage caveat: clubelo is Europe-centric; non-EU clubs (Saudi, MLS, Brazil,
// J-League) are often absent — handled by the tier fallback in derive.ts.

import { fetchCached, parseCsv } from '../lib/util';

export interface ClubEloRow {
  rank: number | null;
  club: string;
  country: string;
  level: number | null;
  elo: number;
}

// A recent date snapshot. Pinned (not "today") for reproducible builds.
const SNAPSHOT_DATE = '2026-06-25';

export async function fetchClubElo(): Promise<ClubEloRow[]> {
  const text = await fetchCached(
    `http://api.clubelo.com/${SNAPSHOT_DATE}`,
    `clubelo-${SNAPSHOT_DATE}.csv`,
  );
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iRank = idx('rank');
  const iClub = idx('club');
  const iCountry = idx('country');
  const iLevel = idx('level');
  const iElo = idx('elo');

  const out: ClubEloRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row[iClub]) continue;
    const eloNum = parseFloat(row[iElo]);
    if (Number.isNaN(eloNum)) continue;
    out.push({
      rank: row[iRank] && row[iRank] !== 'None' ? parseInt(row[iRank], 10) : null,
      club: row[iClub].trim(),
      country: iCountry >= 0 ? row[iCountry].trim() : '',
      level: iLevel >= 0 && row[iLevel] ? parseInt(row[iLevel], 10) : null,
      elo: eloNum,
    });
  }
  return out;
}
