---
name: worldcup-data
description: Query the Kickabout World Cup 2026 warehouse (Cloudflare D1) for grounded match facts — results, lineups, stats, xG, injuries, odds movement, head-to-head, player/club context. Use this whenever writing a match preview, recap, or feature so the piece is built on real, verifiable data (not memory or unverified web results). The D1 warehouse is the single source of truth for FACTS; web search is only for fresh NEWS/quotes/sentiment the warehouse can't hold.
---

# World Cup 2026 data warehouse (Cloudflare D1)

You are writing editorial for **Kickabout**, a World Cup 2026 site. Every piece must
be **grounded in real data**. That data lives in a **Cloudflare D1** database
(`worldcup-site`) refreshed hourly from API-Football (+ scraped SofaScore). This skill
tells you what's in it and how to query it.

## The one rule: facts from D1, colour from web search

- **D1 is the source of truth for anything factual** — scores, lineups, stats, xG,
  injuries, odds, caps/goals, head-to-head, form. If D1 knows it, **use D1's value**,
  never your memory and never a web result that contradicts it. Wrong facts are the
  worst failure mode here.
- **Web search is only for what D1 cannot have** — breaking news, injury updates newer
  than the last hourly refresh, manager/player quotes, press-conference lines, fan
  sentiment. Treat web results as **unverified** until they agree with a D1 fact.
- **Never invent** scorelines, transfers, quotes, or injuries. If neither D1 nor web
  search has it, write around it.
- Everything in D1 is real API data **except** two derived signals, clearly labelled
  below: `player_tier`/`club_tier` (our own strength buckets) and any `*_xg` (provider
  model output). Don't present derived signals as hard fact — gloss them ("our rating",
  "expected goals").

## How to query D1 (REST API)

POST SQL to the D1 HTTP API:

```
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query
Authorization: Bearer {D1_API_TOKEN}
Content-Type: application/json

{ "sql": "SELECT ...", "params": [] }
```

- `ACCOUNT_ID` = `cfe39f4145ce89e2b746ed4e787c3b7a`
- `DATABASE_ID` = `fa7b603e-53e3-450f-adc4-a1e3133adaaa` (database name `worldcup-site`)
- `D1_API_TOKEN` = a scoped token (ask the operator; needs **D1 → read**). Keep it out of
  written output.
- Response: `result[0].results` is the array of rows. Use `params` + `?` placeholders for
  any user-derived values.

It's plain SQLite (D1). `SELECT` freely; you have read access. Compose your own queries —
the recipes below are starting points, not limits.

## Identifiers

- Our stable team id is a **slug**: `brazil`, `south-korea`, `united-states`,
  `bosnia-and-herzegovina`, `dr-congo`, etc. `team.short_code` is the 3-letter code (BRA).
- Fixtures use the **API-Football numeric id** (`af_fixture.id`). Team columns on AF
  tables are our slug where we could map it (`home_team_id`), plus the raw provider name
  (`home_name_raw`). Prefer the slug for joins; the raw name is a fallback/audit.
- Player id in `player` is a slug (`brazil-17`); the AF numeric player id appears in
  `af_player_stat.player_id` / `af_injury.af_player_id`. They match by the id embedded in
  the photo URL, so cross-table player joins are by **name**, not id — match on
  `player_name` when bridging AF stats to the `player` table.

## What's in the warehouse

**Fixtures & results**
- `af_fixture` — every WC2026 fixture: `id, date, status_short` (FT/NS/1H/…), `stage`
  (group/r32/r16/qf/sf/final), `venue, city`, `home_team_id/away_team_id` (+ `_name_raw`),
  `home_score/away_score`. **This is the live match state, refreshed hourly.**
- `wc_match` — a parallel snapshot of the 104-match schedule (venues/cities). `af_fixture`
  is the authoritative live one; prefer it for status/scores.
- `match_goal` — goalscorers per wc_match (scorer, minute, penalty).

**What happened in a match (finished games)**
- `af_event` — goals, cards, substitutions with `minute`, `player_name`, `assist_name`,
  `type` (Goal/Card/subst/Var), `detail`. The play-by-play for recaps.
- `af_team_stat` — per-team match stats as `stat_type`/`stat_value` rows: `Ball Possession`,
  `Total Shots`, `Shots on Goal`, `expected_goals`, `Passes %`, `Corner Kicks`, etc.
- `af_player_stat` — per-player per-match: `minutes, rating, goals, assists, shots,
  shots_on, passes, pass_accuracy, tackles, duels_won, dribbles, yellow, red, captain`.
- `af_lineup` / `af_lineup_player` — the **actual XIs that started** (formation, coach,
  jersey number, starter flag). For finished games this is who really played.

**xG (a derived provider model — gloss as "expected goals")**
- `match_xg` **(VIEW)** — one row per finished fixture with `home_xg`, `away_xg`, the
  team names, and the **actual score**. The "deserved it / lucky / unlucky" story in one
  query, e.g. `Qatar 0.6 xG (1–1) 3.2 xG Switzerland`.

**Injuries & suspensions**
- `af_injury` — `team_id, player_name, type` ("Missing Fixture"/"Questionable"), `reason`
  ("Calf Injury"/"Suspended"), `date`, `fixture_id`. **Quirk:** a player out for several
  games appears **once per fixture** they miss — `GROUP BY player_name` (or `DISTINCT`) to
  list "who's out" for a team. Refreshed hourly, but confirm very-latest news via web
  search near kick-off.

**Odds (bookmaker 1X2)**
- `af_odds` — the **latest** snapshot per bookmaker per upcoming fixture (`home_odd,
  draw_odd, away_odd`). Use for "the current price".
- `af_odds_history` — an **append-only hourly time series** (adds `snapshot_ts`, unix
  seconds). Use for **movement**: compare earliest vs latest per fixture/bookmaker to say
  "the line shortened from 1.45 to 1.31 over the week". Only upcoming fixtures accumulate;
  history is pruned once a game is played.

**Head-to-head & history**
- `h2h` — precomputed all-time record between two current WC nations, **stored both
  directions** (`team_a, team_b, played, a_wins, draws, b_wins, a_goals, b_goals,
  last_meeting, last_a_score, last_b_score`). One row = the summary line.
- `intl_result` — the **full all-time international results archive** (~49k rows since
  1872): `date, home_name, away_name, home_team_id/away_team_id` (slug if a current WC
  nation), `home_score, away_score, tournament, neutral`. Query this for *specific* past
  meetings, notable upsets, World-Cup-only history, biggest wins, etc. — richer than the
  `h2h` summary.

**Teams & players**
- `team` — `id, name, short_code, confederation, group_letter, coach_name, elo, fifa_rank,
  points, goal_diff, status` (winner/runner_up/best_third/contention/eliminated).
- `player` — `id, team_id, club_id, name, position` (GK/DF/MF/FW), `age, caps` (career
  international appearances), `goals` (career international), `photo`.
- `club` / `league` — club + its league, with a clubelo `elo` where matched.
- `club_tier` (**derived**: Elite/Strong/Solid/Modest/Lower, from club Elo) and
  `player_tier` (**derived**: Elite/Established/Squad/Prospect). Use as colour ("plays at
  an elite club"), not as hard fact.
- `af_player` — AF's squad list (adds shirt number + photo); `af_standing` — group tables.

**Fan sentiment (scraped SofaScore — soft signal)**
- `ss_vote` — who-will-win fan vote counts (`vote_home, vote_draw, vote_away`) per SS match.
- `ss_match` / `ss_predicted_lineup_player` — SS match mapping + **predicted** XIs (used
  before a game; the *actual* XI is in `af_lineup`).

## Query recipes

Adapt freely — these show the joins, not the only way.

**Match brief (everything for one fixture, upcoming or played):**
```sql
-- by teams + stage; get the fixture row first
SELECT id, date, status_short, stage, venue, home_team_id, away_team_id, home_score, away_score
FROM af_fixture
WHERE home_team_id = ? AND away_team_id = ? AND stage = ?;
-- then, using its id, pull events, team stats, lineups, xG (match_xg), odds, etc.
```

**Who's out (deduped) for a team:**
```sql
SELECT player_name, reason, MIN(date) AS out_since
FROM af_injury WHERE team_id = ? GROUP BY player_name, reason ORDER BY out_since;
```

**Head-to-head summary + the notable past meetings:**
```sql
SELECT played, a_wins, draws, b_wins, last_meeting, last_a_score, last_b_score
FROM h2h WHERE team_a = ? AND team_b = ?;

SELECT date, home_name, home_score, away_score, away_name, tournament
FROM intl_result
WHERE (home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?)
ORDER BY date DESC LIMIT 10;
```

**xG story for a finished match (deserved/lucky):**
```sql
SELECT home_name_raw, home_xg, home_score, away_score, away_xg, away_name_raw
FROM match_xg WHERE fixture_id = ?;
```

**Odds movement for an upcoming fixture (one bookmaker):**
```sql
SELECT snapshot_ts, home_odd, draw_odd, away_odd
FROM af_odds_history WHERE fixture_id = ? AND bookmaker = ? ORDER BY snapshot_ts;
-- earliest vs latest = the drift to narrate.
```

**Star men / squad for a team (with derived tiers as colour):**
```sql
SELECT p.name, p.position, p.age, p.caps, p.goals, c.name AS club,
       pt.tier_label AS player_tier, ct.tier_label AS club_tier
FROM player p
LEFT JOIN club c ON c.id = p.club_id
LEFT JOIN player_tier pt ON pt.player_id = p.id
LEFT JOIN club_tier ct ON ct.club_id = p.club_id
WHERE p.team_id = ? ORDER BY p.goals DESC;
```

**Actual starting XI that played a match:**
```sql
SELECT team_id, formation, player_name, number
FROM af_lineup_player WHERE fixture_id = ? AND starter = 1 ORDER BY team_id, number;
```

## Workflow for a match piece

1. **Pull the facts from D1 first** — fixture state, (if played) events/stats/xG/lineups,
   H2H, injuries, current odds + movement, star men. This is your spine.
2. **Web-search only the gaps** — latest team news, manager quotes, injury updates newer
   than the hourly refresh, mood. Cross-check every web claim against the D1 facts; if
   they conflict, D1 wins for anything factual.
3. **Write in the Kickabout voice** (see the editorial style guide): plain English, a clear
   take, concrete specifics — real players, clubs, scores, the Davies-vs-Modiba flank.
   Gloss derived signals ("our rating", "expected goals"); never imply certainty; not
   betting advice.
