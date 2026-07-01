// Betting-market implied probabilities, seeded from public sources (ESPN, CBS,
// FanDuel, Kalshi/Polymarket via defirate) as of late June 2026. Snapshot, not
// live — a free odds API can refresh these later (see data-pipeline odds fetch).
export const MARKET_ASOF = 'late June 2026';

// Per-match bookmaker-implied 1X2 %, keyed by `${homeId}-${awayId}`.
export const MARKET_MATCHES: Record<string, { home: number; draw: number; away: number }> = {
  'south-africa-canada': { home: 16, draw: 26, away: 58 },
  'brazil-japan': { home: 55, draw: 27, away: 18 },
  'netherlands-morocco': { home: 40, draw: 32, away: 28 },
  'united-states-bosnia-and-herzegovina': { home: 65, draw: 22, away: 13 },
};

// Outright winner implied %: bookmaker consensus vs prediction markets.
export interface OutrightRow { id: string; book: number; polymarket: number | null; kalshi: number | null }
export const MARKET_OUTRIGHT: OutrightRow[] = [
  { id: 'france', book: 28.8, polymarket: 28.8, kalshi: 29.0 },
  { id: 'argentina', book: 20.0, polymarket: 19.4, kalshi: 21.0 },
  { id: 'spain', book: 11.2, polymarket: 11.3, kalshi: 10.7 },
  { id: 'england', book: 10.0, polymarket: 10.1, kalshi: 9.4 },
  { id: 'brazil', book: 10.0, polymarket: 7.0, kalshi: 7.0 },
  { id: 'portugal', book: 6.7, polymarket: 6.4, kalshi: 6.5 },
  { id: 'morocco', book: 3.8, polymarket: 3.8, kalshi: 3.7 },
  { id: 'united-states', book: 3.2, polymarket: 2.8, kalshi: 3.9 },
  { id: 'colombia', book: 2.8, polymarket: 2.8, kalshi: 2.8 },
  { id: 'mexico', book: 2.0, polymarket: 1.5, kalshi: 3.1 },
  { id: 'norway', book: 2.0, polymarket: 2.0, kalshi: 2.0 },
  { id: 'belgium', book: 1.4, polymarket: 1.4, kalshi: 1.2 },
  { id: 'switzerland', book: 0.9, polymarket: 0.9, kalshi: 0.8 },
  { id: 'ecuador', book: 0.5, polymarket: 0.5, kalshi: 0.4 },
  { id: 'croatia', book: 0.4, polymarket: 0.4, kalshi: 0.4 },
  { id: 'senegal', book: 0.4, polymarket: 0.4, kalshi: 0.4 },
];
