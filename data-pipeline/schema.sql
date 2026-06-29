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
DROP TABLE IF EXISTS player_tier;
DROP TABLE IF EXISTS club_tier;
DROP TABLE IF EXISTS h2h;
DROP TABLE IF EXISTS intl_result;
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
  goals         INTEGER                     -- international goals (career)
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
