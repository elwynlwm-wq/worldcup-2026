// Derived signals — computed from the linked tables. These are OUR signals,
// built from facts via our own formulas. Never copied from a proprietary rating
// (see REQUIREMENTS.md item 8 / the EA decision).

import type { Database } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Head-to-head: all-time record between every pair of CURRENT WC nations,
// computed from intl_result. Stored both directions for O(1) lookup.
// ---------------------------------------------------------------------------
export function deriveH2H(db: Database): number {
  // Pull every historical result that involves two mapped WC nations.
  const rows = db
    .prepare(
      `SELECT home_team_id AS h, away_team_id AS a, home_score AS hs, away_score AS ascore, date
       FROM intl_result
       WHERE home_team_id IS NOT NULL AND away_team_id IS NOT NULL`,
    )
    .all() as { h: string; a: string; hs: number; ascore: number; date: string }[];

  // Accumulate per unordered pair, then emit both directions.
  type Acc = {
    played: number; aWins: number; draws: number; bWins: number;
    aGoals: number; bGoals: number;
    last: string; lastAScore: number | null; lastBScore: number | null; // scoreline of most recent meeting, x's POV
  };
  const acc = new Map<string, Acc>(); // key: "x|y" with x<y; stats from x's POV

  for (const r of rows) {
    const [x, y] = r.h < r.a ? [r.h, r.a] : [r.a, r.h];
    const key = `${x}|${y}`;
    let s = acc.get(key);
    if (!s) {
      s = { played: 0, aWins: 0, draws: 0, bWins: 0, aGoals: 0, bGoals: 0, last: '', lastAScore: null, lastBScore: null };
      acc.set(key, s);
    }
    // Express this match from x's POV.
    const xIsHome = r.h === x;
    const xScore = xIsHome ? r.hs : r.ascore;
    const yScore = xIsHome ? r.ascore : r.hs;
    s.played++;
    s.aGoals += xScore;
    s.bGoals += yScore;
    if (xScore > yScore) s.aWins++;
    else if (xScore < yScore) s.bWins++;
    else s.draws++;
    if (r.date > s.last) {
      s.last = r.date;
      s.lastAScore = xScore;
      s.lastBScore = yScore;
    }
  }

  const ins = db.prepare(`INSERT OR REPLACE INTO h2h
    (team_a,team_b,played,a_wins,draws,b_wins,a_goals,b_goals,last_meeting,last_a_score,last_b_score)
    VALUES (@team_a,@team_b,@played,@a_wins,@draws,@b_wins,@a_goals,@b_goals,@last_meeting,@last_a_score,@last_b_score)`);

  let count = 0;
  db.transaction(() => {
    for (const [key, s] of acc) {
      const [x, y] = key.split('|');
      // x's POV
      ins.run({ team_a: x, team_b: y, played: s.played, a_wins: s.aWins, draws: s.draws, b_wins: s.bWins, a_goals: s.aGoals, b_goals: s.bGoals, last_meeting: s.last, last_a_score: s.lastAScore, last_b_score: s.lastBScore });
      // y's POV (mirror — also mirror the last scoreline)
      ins.run({ team_a: y, team_b: x, played: s.played, a_wins: s.bWins, draws: s.draws, b_wins: s.aWins, a_goals: s.bGoals, b_goals: s.aGoals, last_meeting: s.last, last_a_score: s.lastBScore, last_b_score: s.lastAScore });
      count += 2;
    }
  })();
  return count;
}

// ---------------------------------------------------------------------------
// Club strength tier — coarse 1..5 from club Elo where we have it, else a
// league-tier-hint fallback, else a neutral default. Legible labels for fans.
// ---------------------------------------------------------------------------
const CLUB_LABELS = ['Elite', 'Strong', 'Solid', 'Modest', 'Lower'];

function clubTierFromElo(elo: number): number {
  // clubelo ratings roughly: >1900 elite, 1750+ strong, 1600+ solid, 1450+ modest, else lower.
  if (elo >= 1900) return 1;
  if (elo >= 1750) return 2;
  if (elo >= 1600) return 3;
  if (elo >= 1450) return 4;
  return 5;
}

function clubTierFromLeagueHint(hint: number | null): number {
  // Map a coarse league hint (1 elite league .. 4 modest) to a mid-band club tier.
  if (hint == null) return 4; // unknown → Modest by default
  return Math.min(5, hint + 1); // elite league → tier 2 (Strong) as a safe default
}

export function deriveTiers(db: Database): { clubs: number; players: number } {
  // --- club tiers ---
  const clubs = db
    .prepare(`SELECT c.id, c.elo, l.tier_hint FROM club c LEFT JOIN league l ON c.league_id = l.id`)
    .all() as { id: string; elo: number | null; tier_hint: number | null }[];

  const insClubTier = db.prepare(
    `INSERT OR REPLACE INTO club_tier (club_id,tier,tier_label,basis) VALUES (@club_id,@tier,@tier_label,@basis)`,
  );
  const tierByClub = new Map<string, number>();
  db.transaction(() => {
    for (const c of clubs) {
      let tier: number;
      let basis: string;
      if (c.elo != null) {
        tier = clubTierFromElo(c.elo);
        basis = `clubelo ${Math.round(c.elo)}`;
      } else {
        tier = clubTierFromLeagueHint(c.tier_hint);
        basis = c.tier_hint != null ? `league hint ${c.tier_hint}` : 'fallback';
      }
      tierByClub.set(c.id, tier);
      insClubTier.run({ club_id: c.id, tier, tier_label: CLUB_LABELS[tier - 1], basis });
    }
  })();

  // --- player tiers (by position), our own blend ---
  // Inputs: international goals + caps (career), and the player's club tier.
  // We compute a score, then bucket into 4 tiers PER POSITION so a great keeper
  // isn't penalised against forwards' goal counts.
  const PLAYER_LABELS = ['Elite', 'Established', 'Squad', 'Prospect'];
  const players = db
    .prepare(`SELECT id, team_id, club_id, position, caps, goals FROM player`)
    .all() as { id: string; team_id: string; club_id: string | null; position: string; caps: number; goals: number }[];

  // score = caps weight + goals weight (position-aware) + club-tier bonus.
  const score = (p: (typeof players)[number]): number => {
    const clubTier = p.club_id ? tierByClub.get(p.club_id) ?? 4 : 5;
    const clubBonus = (6 - clubTier) * 8; // elite club (tier1) → +40, lower → +8
    const goalW = p.position === 'FW' ? 1.5 : p.position === 'MF' ? 1.0 : 0.5;
    return p.caps * 1.0 + p.goals * goalW * 2 + clubBonus;
  };

  // Bucket by position using simple percentile cutoffs within each position group.
  const byPos: Record<string, { id: string; s: number }[]> = {};
  for (const p of players) {
    (byPos[p.position] ??= []).push({ id: p.id, s: score(p) });
  }
  const tierByPlayer = new Map<string, { tier: number; s: number }>();
  for (const pos of Object.keys(byPos)) {
    const arr = byPos[pos].sort((a, b) => b.s - a.s);
    const n = arr.length;
    arr.forEach((row, i) => {
      const pctile = i / n; // 0 = best
      let tier: number;
      if (pctile < 0.15) tier = 1; // top 15% Elite
      else if (pctile < 0.45) tier = 2; // next 30% Established
      else if (pctile < 0.8) tier = 3; // next 35% Squad
      else tier = 4; // bottom 20% Prospect
      tierByPlayer.set(row.id, { tier, s: row.s });
    });
  }

  const insPlayerTier = db.prepare(
    `INSERT OR REPLACE INTO player_tier (player_id,tier,tier_label,basis) VALUES (@player_id,@tier,@tier_label,@basis)`,
  );
  db.transaction(() => {
    for (const [pid, { tier, s }] of tierByPlayer) {
      insPlayerTier.run({
        player_id: pid,
        tier,
        tier_label: PLAYER_LABELS[tier - 1],
        basis: `score ${Math.round(s)}`,
      });
    }
  })();

  return { clubs: clubs.length, players: tierByPlayer.size };
}
