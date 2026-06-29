-- World Cup 2026 warehouse — schema (v1)
--
-- A linkable relational core so head-to-head and strength tiers are QUERIES,
-- not hand-built tables: players → clubs → leagues, players → teams,
-- teams → matches. See data-pipeline/V1-PLAN.md.
--
-- Identifiers are our own stable slugs. Where a source has its own id we keep it
-- in a *_source column for reconciliation, mirroring the sourceRefs idea in
-- docs/data-model.md.

PRAGMA foreign_keys = ON;

-- Drop in dependency order so the build is idempotent (rebuild from scratch).
DROP TABLE IF EXISTS ss_predicted_lineup_player;
DROP TABLE IF EXISTS ss_vote;
DROP TABLE IF EXISTS ss_match;
DROP TABLE IF EXISTS af_odds;
DROP TABLE IF EXISTS af_player_stat;
DROP TABLE IF EXISTS af_lineup_player;
DROP TABLE IF EXISTS af_lineup;
DROP TABLE IF EXISTS af_event;
DROP TABLE IF EXISTS af_team_stat;
DROP TABLE IF EXISTS af_standing;
DROP TABLE IF EXISTS af_fixture;
DROP TABLE IF EXISTS af_player;
DROP TABLE IF EXISTS player_tier;
DROP TABLE IF EXISTS club_tier;
DROP TABLE IF EXISTS h2h;
DROP TABLE IF EXISTS intl_result;
DROP TABLE IF EXISTS match_goal;
DROP TABLE IF EXISTS wc_match;
DROP TABLE IF EXISTS player;
DROP TABLE IF EXISTS club;
DROP TABLE IF EXISTS league;
DROP TABLE IF EXISTS team;

-- ---------------------------------------------------------------------------
-- Core entities
-- ---------------------------------------------------------------------------

-- National teams in WC2026 (from our verified snapshot).
CREATE TABLE team (
  id            TEXT PRIMARY KEY,          -- slug, e.g. "brazil"
  name          TEXT NOT NULL,             -- "Brazil"
  short_code    TEXT NOT NULL,             -- "BRA"
  confederation TEXT NOT NULL,             -- UEFA | CONMEBOL | ...
  group_letter  TEXT,                      -- "C"
  coach_name    TEXT,
  elo           INTEGER,                   -- from snapshot RATINGS
  fifa_rank     INTEGER,
  -- snapshot standings (group stage)
  points        INTEGER,
  goal_diff     INTEGER,
  status        TEXT                        -- winner | runner_up | best_third | contention | eliminated
);

-- Leagues/competitions a club plays in (e.g. "Premier League", "Saudi Pro League").
-- Carries a coarse tier used as a fallback signal for club strength.
CREATE TABLE league (
  id            TEXT PRIMARY KEY,          -- slug
  name          TEXT NOT NULL,
  country       TEXT,
  tier_hint     INTEGER                     -- 1 (top) .. 5, hand-mapped for major leagues; null if unknown
);

-- Clubs that WC players play for. clubelo rating attached where matched.
CREATE TABLE club (
  id            TEXT PRIMARY KEY,          -- slug, e.g. "real-madrid"
  name          TEXT NOT NULL,             -- as it appears in our squad data
  clubelo_name  TEXT,                      -- matched clubelo name (for reconciliation)
  league_id     TEXT REFERENCES league(id),
  elo           REAL                        -- clubelo rating; null if unmatched
);

-- Players in WC2026 squads (from snapshot), linked to their national team and club.
CREATE TABLE player (
  id            TEXT PRIMARY KEY,          -- "brazil-17"
  team_id       TEXT NOT NULL REFERENCES team(id),
  club_id       TEXT REFERENCES club(id),
  name          TEXT NOT NULL,
  position      TEXT NOT NULL,             -- GK | DF | MF | FW
  age           INTEGER,
  caps          INTEGER,                   -- international caps (career)
  goals         INTEGER,                    -- international goals (career)
  photo         TEXT                        -- avatar URL (API-Football), matched by name; null if unmatched
);

-- ---------------------------------------------------------------------------
-- Matches & results
-- ---------------------------------------------------------------------------

-- WC2026 fixtures/results (snapshot + openfootball structure).
CREATE TABLE wc_match (
  id            TEXT PRIMARY KEY,
  stage         TEXT NOT NULL,             -- group | r32 | r16 | qf | sf | final
  group_letter  TEXT,
  kickoff       TEXT,                      -- ISO-ish
  venue         TEXT,
  city          TEXT,
  home_team_id  TEXT REFERENCES team(id),
  away_team_id  TEXT REFERENCES team(id),
  home_score    INTEGER,
  away_score    INTEGER,
  status        TEXT                        -- scheduled | finished
);

-- Goalscorers per WC match (from openfootball goals1/goals2). side = home|away.
CREATE TABLE match_goal (
  id            INTEGER PRIMARY KEY,
  match_id      TEXT NOT NULL REFERENCES wc_match(id),
  side          TEXT NOT NULL,             -- home | away
  team_id       TEXT REFERENCES team(id),
  scorer        TEXT NOT NULL,             -- player name as in openfootball
  minute        TEXT,                      -- "67", "90+2", etc.
  penalty       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_goal_match ON match_goal(match_id);

-- All-time international results (martj42 international_results, ~48k rows).
-- Stored with raw country names; we map to our team ids where possible so H2H
-- can be derived. Predecessor states (USSR, etc.) handled as a noted limitation.
CREATE TABLE intl_result (
  id            INTEGER PRIMARY KEY,
  date          TEXT NOT NULL,
  home_name     TEXT NOT NULL,             -- raw, as in source
  away_name     TEXT NOT NULL,
  home_team_id  TEXT,                      -- mapped slug if it's a current WC nation, else null
  away_team_id  TEXT,
  home_score    INTEGER,
  away_score    INTEGER,
  tournament    TEXT,                      -- "FIFA World Cup", "Friendly", ...
  neutral       INTEGER                     -- 0/1
);

CREATE INDEX idx_intl_home ON intl_result(home_team_id);
CREATE INDEX idx_intl_away ON intl_result(away_team_id);

-- ---------------------------------------------------------------------------
-- Derived signals (computed by build/derive.ts from the tables above)
-- ---------------------------------------------------------------------------

-- All-time head-to-head between two CURRENT WC nations, stored both directions
-- (a vs b and b vs a) for easy lookup. team_a is always the "subject".
CREATE TABLE h2h (
  team_a        TEXT NOT NULL REFERENCES team(id),
  team_b        TEXT NOT NULL REFERENCES team(id),
  played        INTEGER NOT NULL,
  a_wins        INTEGER NOT NULL,
  draws         INTEGER NOT NULL,
  b_wins        INTEGER NOT NULL,
  a_goals       INTEGER NOT NULL,
  b_goals       INTEGER NOT NULL,
  last_meeting  TEXT,                      -- date of most recent meeting
  last_a_score  INTEGER,                   -- score of team_a in the last meeting
  last_b_score  INTEGER,                   -- score of team_b in the last meeting
  PRIMARY KEY (team_a, team_b)
);

-- Coarse club strength tier (our own derivation; never a copied rating).
CREATE TABLE club_tier (
  club_id       TEXT PRIMARY KEY REFERENCES club(id),
  tier          INTEGER NOT NULL,          -- 1 Elite .. 5 Lower
  tier_label    TEXT NOT NULL,             -- "Elite" | "Strong" | "Solid" | "Modest" | "Lower"
  basis         TEXT                        -- short note on what drove it (elo/league/fallback)
);

-- Coarse player strength tier by position (our own derivation).
CREATE TABLE player_tier (
  player_id     TEXT PRIMARY KEY REFERENCES player(id),
  tier          INTEGER NOT NULL,          -- 1 Elite .. 4 Prospect
  tier_label    TEXT NOT NULL,             -- "Elite" | "Established" | "Squad" | "Prospect"
  basis         TEXT
);

-- ---------------------------------------------------------------------------
-- API-Football (paid) — kept in its OWN namespace for cross-checking against
-- the free stack, and as the fresh live-fixtures source. team_id maps to our
-- slug where reconciled. See SOURCING.md (publish-rights caveat).
-- ---------------------------------------------------------------------------
CREATE TABLE af_fixture (
  id            INTEGER PRIMARY KEY,       -- API-Football fixture id
  date          TEXT,
  status_short  TEXT,                      -- FT | NS | 1H | HT | ...
  status_long   TEXT,
  elapsed       INTEGER,
  round         TEXT,
  stage         TEXT,                      -- mapped: group|r32|r16|qf|sf|final
  venue         TEXT,
  city          TEXT,
  home_team_id  TEXT,                      -- our slug if mapped, else null
  away_team_id  TEXT,
  home_name_raw TEXT,                      -- API-Football's name (for audit)
  away_name_raw TEXT,
  home_score    INTEGER,
  away_score    INTEGER
);

CREATE TABLE af_player (
  id            INTEGER PRIMARY KEY,       -- API-Football player id
  team_id       TEXT,                      -- our slug if mapped
  name          TEXT,
  number        INTEGER,
  position      TEXT,
  photo         TEXT
);

-- Official group standings (snapshot).
CREATE TABLE af_standing (
  group_name    TEXT,
  rank          INTEGER,
  team_id       TEXT,                      -- our slug if mapped
  team_name_raw TEXT,
  played        INTEGER, win INTEGER, draw INTEGER, lose INTEGER,
  goals_for     INTEGER, goals_against INTEGER, points INTEGER,
  form          TEXT
);

-- Per-match team statistics (possession, shots, xG, passes, …). Long form:
-- one row per (fixture, team, stat type) for easy querying.
CREATE TABLE af_team_stat (
  fixture_id    INTEGER,
  af_team_id    INTEGER,
  team_id       TEXT,                      -- our slug if mapped
  stat_type     TEXT,                      -- "Ball Possession", "expected_goals", …
  stat_value    TEXT,                      -- raw value (e.g. "55%", "1.8")
  PRIMARY KEY (fixture_id, af_team_id, stat_type)
);

-- Match events timeline (goals, cards, subs, VAR).
CREATE TABLE af_event (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id    INTEGER,
  minute        INTEGER, extra INTEGER,
  af_team_id    INTEGER, team_id TEXT,
  player_id     INTEGER, player_name TEXT, assist_name TEXT,
  type          TEXT, detail TEXT
);
CREATE INDEX idx_event_fixture ON af_event(fixture_id);

-- Lineups (one per fixture+team) + their players.
CREATE TABLE af_lineup (
  fixture_id    INTEGER,
  af_team_id    INTEGER,
  team_id       TEXT,
  formation     TEXT,
  coach         TEXT,
  PRIMARY KEY (fixture_id, af_team_id)
);
CREATE TABLE af_lineup_player (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id    INTEGER,
  af_team_id    INTEGER,
  player_id     INTEGER, player_name TEXT, number INTEGER,
  pos           TEXT, grid TEXT,
  starter       INTEGER                    -- 1 startXI, 0 sub
);
CREATE INDEX idx_lineupp_fixture ON af_lineup_player(fixture_id);

-- Per-player per-match stats (ratings, shots, passes, duels, …).
CREATE TABLE af_player_stat (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id    INTEGER,
  af_team_id    INTEGER, team_id TEXT,
  player_id     INTEGER, player_name TEXT,
  minutes       INTEGER, rating TEXT,
  goals INTEGER, assists INTEGER,
  shots INTEGER, shots_on INTEGER,
  passes INTEGER, pass_accuracy INTEGER,
  tackles INTEGER, duels_won INTEGER, dribbles INTEGER,
  yellow INTEGER, red INTEGER, captain INTEGER
);
CREATE INDEX idx_pstat_fixture ON af_player_stat(fixture_id);
CREATE INDEX idx_pstat_player ON af_player_stat(player_id);

-- Pre-match 1X2 odds (Match Winner market) per bookmaker, per AF fixture.
-- One row = one bookmaker's home/draw/away price. API-Football populates odds
-- close to kick-off; rows only exist for fixtures the API has priced.
CREATE TABLE af_odds (
  fixture_id    INTEGER,
  bookmaker     TEXT,                      -- bookmaker name (e.g. "Bet365")
  home_odd      REAL,                      -- decimal odds: home win
  draw_odd      REAL,
  away_odd      REAL
);
CREATE INDEX idx_afodds_fixture ON af_odds(fixture_id);

-- ---------------------------------------------------------------------------
-- SofaScore (scraped via RapidAPI) — DEV SOURCE ONLY, own namespace.
-- The predicted signals nothing else gives: who-will-win fan votes + PREDICTED
-- lineups. NOT for publishing (see SOURCING.md). ss_match maps SS match ids to
-- our team slugs + (where matched) our wc_match / af_fixture by team+date.
-- ---------------------------------------------------------------------------
CREATE TABLE ss_match (
  id             INTEGER PRIMARY KEY,      -- SofaScore match id
  home_team_id   TEXT,                     -- our slug if mapped
  away_team_id   TEXT,
  home_name_raw  TEXT,
  away_name_raw  TEXT,
  start_ts       INTEGER,
  status         TEXT
);

CREATE TABLE ss_vote (
  match_id       INTEGER PRIMARY KEY REFERENCES ss_match(id),
  vote_home      INTEGER,                  -- who-will-win: home
  vote_draw      INTEGER,
  vote_away      INTEGER
);

CREATE TABLE ss_predicted_lineup_player (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id       INTEGER REFERENCES ss_match(id),
  side           TEXT,                     -- home | away
  team_id        TEXT,                     -- our slug if mapped
  confirmed      INTEGER,                  -- 0 = predicted XI, 1 = official
  formation      TEXT,
  player_name    TEXT,
  position       TEXT,
  jersey         TEXT,
  substitute     INTEGER
);
CREATE INDEX idx_sspred_match ON ss_predicted_lineup_player(match_id);
