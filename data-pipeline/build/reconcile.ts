// Name reconciliation across sources. The hard part of linking free data.
//
// Two problems:
//  1. Club names differ (snapshot "Inter Milan" vs clubelo "Inter"; "Atlético
//     Madrid" vs "Atletico"). We normalize, then apply a focused alias map for
//     the high-value European clubs. The long tail (Saudi/MLS/Asian clubs absent
//     from clubelo) falls back to a league-based tier, so coverage gaps degrade
//     gracefully rather than failing.
//  2. Country names differ in the all-time results CSV (e.g. historical names).
//     We map current WC nations; predecessor states are a noted limitation.

import { slug } from '../lib/util';

// --- Club name → clubelo name aliases (snapshot side → clubelo side) ---------
// Only the cases plain normalization misses. Keyed by normalized snapshot name.
export const CLUB_ALIASES: Record<string, string> = {
  'inter milan': 'Inter',
  'ac milan': 'Milan',
  'manchester city': 'Man City',
  'manchester united': 'Man United',
  'paris saint-germain': 'Paris SG',
  'atletico madrid': 'Atletico',
  'tottenham hotspur': 'Tottenham',
  'wolverhampton wanderers': 'Wolves',
  'brighton & hove albion': 'Brighton',
  'nottingham forest': 'Forest',
  'west ham united': 'West Ham',
  'newcastle united': 'Newcastle',
  'borussia dortmund': 'Dortmund',
  'borussia monchengladbach': 'Gladbach',
  'bayer leverkusen': 'Leverkusen',
  'bayern munich': 'Bayern',
  'rb leipzig': 'RB Leipzig',
  'vfb stuttgart': 'Stuttgart',
  'eintracht frankfurt': 'Eintracht',
  'sc freiburg': 'Freiburg',
  'fc augsburg': 'Augsburg',
  'tsg hoffenheim': 'Hoffenheim',
  'werder bremen': 'Bremen',
  'sporting cp': 'Sporting',
  'fc porto': 'Porto',
  'red bull salzburg': 'Salzburg',
  'real sociedad': 'Sociedad',
  'athletic bilbao': 'Athletic',
  'athletic club': 'Athletic',
  'celta vigo': 'Celta',
  'real betis': 'Betis',
  'rayo vallecano': 'Rayo',
  'olympiacos': 'Olympiakos',
  'red star belgrade': 'Red Star',
  'fc copenhagen': 'Copenhagen',
  'zenit saint petersburg': 'Zenit',
  'galatasaray': 'Galatasaray',
  'fenerbahce': 'Fenerbahce',
};

/** Normalize a snapshot club name to its clubelo lookup key (a normalized slug). */
export function clubLookupSlug(snapshotClubName: string): string {
  const norm = snapshotClubName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const aliased = CLUB_ALIASES[norm] ?? snapshotClubName;
  return slug(aliased);
}

// --- League inference + tier hint (fallback when clubelo has no rating) -------
// Maps a club to a coarse league tier from its country / known membership.
// This is deliberately rough — it only needs to place a club in a strength band.

// Countries whose TOP division is elite/strong (used as a coarse league signal
// when we can't get a club Elo). This is a heuristic fallback, not a ranking.
const STRONG_LEAGUE_COUNTRIES: Record<string, number> = {
  // tier_hint: 1 = elite leagues, 2 = strong, 3 = solid, 4 = modest
  England: 1, Spain: 1, Germany: 1, Italy: 1, France: 1,
  Portugal: 2, Netherlands: 2, Belgium: 2, Brazil: 2, Argentina: 2,
  Turkey: 3, Scotland: 3, Austria: 3, Switzerland: 3, Greece: 3, Denmark: 3,
  'Saudi Arabia': 3, USA: 3, Mexico: 3,
};

export function leagueTierHintForCountry(country: string | null): number | null {
  if (!country) return null;
  return STRONG_LEAGUE_COUNTRIES[country] ?? null;
}

// For clubs NOT in clubelo (mostly non-European), infer a country from the club
// name so the fallback tier still reflects league strength. Pattern-based — a
// pragmatic heuristic for the long tail, not exhaustive.
// Known prominent clubs by country (gives them a stronger fallback than default).
const CLUB_COUNTRY_HINTS: Array<[RegExp, string]> = [
  [/\b(Flamengo|Palmeiras|Corinthians|São Paulo|Sao Paulo|Santos|Fluminense|Botafogo|Grêmio|Gremio|Internacional|Atlético Mineiro|Atletico Mineiro|Vasco|Cruzeiro|Bahia|Fortaleza|Bragantino)\b/i, 'Brazil'],
  [/\b(Boca Juniors|River Plate|Racing|Independiente|San Lorenzo|Vélez|Velez|Estudiantes|Lanús|Lanus|Talleres|Huracán|Huracan)\b/i, 'Argentina'],
  [/\bAl[- ]|Al\b/i, 'Saudi Arabia'],
  [/\b(LAFC|Los Angeles FC|Inter Miami|LA Galaxy|Seattle|Portland|Atlanta United|Columbus|Cincinnati|Philadelphia Union|New York City|Nashville|Minnesota|Vancouver Whitecaps|Toronto FC|Charlotte|Colorado|FC Dallas|Real Salt Lake|San Diego|New England)\b/i, 'USA'],
  [/\b(América|America|Guadalajara|Monterrey|Tigres|Cruz Azul|Pumas|UNAM|Toluca|Pachuca|León|Leon|Tijuana|Atlas|Juárez|Juarez|Santos Laguna)\b/i, 'Mexico'],
];

export function inferCountryForUnmatchedClub(name: string): string | null {
  for (const [re, country] of CLUB_COUNTRY_HINTS) {
    if (re.test(name)) return country;
  }
  return null;
}

// --- Country reconciliation for all-time results -----------------------------
// The results CSV uses common English country names. Map to our team slugs.
// Includes the few that differ from a plain slug of our team name.
export const COUNTRY_ALIASES: Record<string, string> = {
  'czech republic': 'czechia',
  'usa': 'united-states',
  'united states': 'united-states',
  'south korea': 'south-korea',
  'ivory coast': 'ivory-coast',
  'cape verde': 'cape-verde',
  'dr congo': 'dr-congo',
  'democratic republic of the congo': 'dr-congo',
  'curacao': 'curacao',
  'curaçao': 'curacao',
  'turkey': 'turkiye',
  'türkiye': 'turkiye',
};

/** Map a results-CSV country name to a WC team slug, or null if not a WC nation. */
export function countryToTeamSlug(name: string, validTeamIds: Set<string>): string | null {
  const norm = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const aliased = COUNTRY_ALIASES[norm];
  if (aliased && validTeamIds.has(aliased)) return aliased;
  const s = slug(name);
  return validTeamIds.has(s) ? s : null;
}
