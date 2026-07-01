// Outright winner implied probabilities, seeded from public sources (ESPN/CBS +
// Kalshi/Polymarket via defirate), late-June-2026 snapshot. Per-match market
// odds come live from the pipeline (warehouse getOddsPair); this covers the
// tournament outright + prediction markets, which the pipeline doesn't ingest.
export const MARKET_ASOF = 'late June 2026';
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
];
