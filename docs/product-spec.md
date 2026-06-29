# World Cup analytics site — product spec (v1)

*FIFA Men's World Cup 2026. Drafted 27 June 2026.*

## What this is

A single source of truth for the 2026 World Cup that gives audiences the information they need to judge who will win: every team, every player, every coach, with recent form, injuries and match stats pulled from a live football API. Voting comes later. v1 earns trust by being the place where the data is complete, current and easy to read.

The timing matters. The group stage finished on 26 June and the round of 32 starts on 28 June, so the knockout bracket and live match data are the most valuable things on the site right now. The data model has to handle a tournament that's already half over.

## Goals

- Give a casual fan everything they'd want before forming an opinion on a team: squad, coach, recent results, who's injured, who's in form.
- Be the most current and correct free reference for the 2026 tournament. If a player picks up a knock in a round-of-32 match, the site should reflect it within minutes, not the next day.
- Build the data layer so that adding voting in v2 is a small addition, not a rebuild.

## Non-goals for v1

- No voting, predictions or user accounts. The data model leaves room for them (see the data model doc) but none ship in v1.
- No betting odds or affiliate content.
- No historical tournaments. 2026 only. The schema is tournament-agnostic so 2027 or past editions can be added later, but v1 loads one tournament.
- No editorial or written match reports. The site shows data, not opinion.

## Audience

The primary user is a casual-to-engaged fan who follows the World Cup but not every domestic league. They want to settle an argument or form a view, quickly. They arrive on mobile, often mid-match. Everything below is designed for that person first.

A secondary user is the data-curious fan who'll sort tables and compare players. They're served by the deeper stats views, but those never get in the way of the casual path.

## The format, since the data model depends on it

48 teams, drawn into 12 groups of four. Each team plays three group games. The top two from each group plus the eight best third-placed teams (32 in total) reach a single-elimination knockout: round of 32, round of 16, quarter-finals, semi-finals, third-place play-off, final. 104 matches in all, ending at MetLife Stadium on 19 July. The schema has to model "best third-placed team" qualification and a bracket that isn't a clean power of two at entry.

## Pages and features

### Home

The tournament at a glance. Live and upcoming matches first (the knockouts are on), then a compact view of all 12 groups' final standings, then a way into the bracket. One clear entry point each to teams, players and the bracket.

### Bracket

The full round-of-32-to-final tree. Each slot shows the team, the score if played, and links through to the match page. This is the spine of the knockout phase and probably the most-visited page over the next three weeks.

### Team list and team page

The list shows all 48 teams, filterable by group and by confederation, sorted by current standing or FIFA ranking. Each team page carries: the squad (with positions and shirt numbers), the coach, group results and current knockout position, a fixtures-and-results strip, team-level match stats aggregated across the tournament (possession, shots, xG if the source provides it), and a clearly flagged injury list.

### Player list and player page

A searchable, filterable directory of every squad player across all 48 teams. Filters that matter to the "who'll win" question: position, team, age, and a form or rating sort. Each player page shows their profile (club, position, age, shirt number), tournament stats so far (minutes, goals, assists, cards, rating per match where available), recent form, and injury status. Where the API exposes last-12-months club data, surface it, because a player's pre-tournament form is part of the judgement.

### Coach page

Often skipped on fan sites, and the user specifically wants it. Each coach shows nationality, the team they manage, tenure, and tournament record. Reachable from the team page and from a coaches index.

### Search

Global search across teams, players and coaches. For a directory site this is a primary navigation tool, not a nice-to-have.

### Injuries view

A cross-tournament injury board: who's out, who's doubtful, expected return, across all teams. This is one of the clearest signals for the "who will win" judgement and worth its own page rather than being buried per-team.

## Data freshness

Three tiers, because not everything changes at the same rate.

- **Live (match in progress):** scores, events, lineups. Poll the API every 30–60 seconds during a live match only. Outside live windows, don't poll at all.
- **Daily:** standings, fixtures, injuries, squad changes. Refresh on a schedule a few times a day.
- **Static:** team metadata, coach profiles, player profiles. Refresh once a day; these rarely move.

The point of the tiering is cost and rate limits. Polling everything live would burn the API quota and money for no benefit. The data model doc specifies which entity sits in which tier.

## Data source

Live football API. The recommendation is **API-Football (API-Sports)** for v1: it covers fixtures, lineups, player statistics, standings, injuries, coaches and predictions, has an explicit 2026 World Cup guide, and starts around $19/month, which is the cheapest credible option. The main watch-out is a per-day request cap, which the freshness tiering above is built to respect.

If data quality or live reliability becomes a problem, **Sportmonks** is the premium fallback (better-regarded data, but the league-and-add-on pricing typically lands at €100s/month), and **BALLDONTLIE's FIFA World Cup API** is worth a look because it's purpose-built for the World Cup specifically. The data model is written against a generic shape so the provider can be swapped without touching the rest of the site. See the data model doc for the abstraction.

A licensing note worth checking before launch: most of these APIs restrict redistribution of raw data and some restrict commercial display. Confirm the terms for public display on the chosen plan.

## Tech direction (proposed, not decided)

A thin backend that talks to the API, normalises the response into the SSOT schema, caches it, and serves a clean internal API to the frontend. The frontend never calls the football API directly, for three reasons: it hides the API key, it lets us cache and respect rate limits centrally, and it means swapping providers is a backend-only change. Frontend can be React. Storage can start as a cached JSON layer and move to a small database if voting (which needs to persist user input) lands in v2.

The prototype I build next will stub the backend with realistic sample data shaped exactly like the SSOT schema, so the UI is real even before the API key exists.

## Success measures for v1

- Coverage: all 48 teams, all squads, all coaches present and correct.
- Freshness: live match data visibly updates during a knockout game; injuries reflect within a day.
- Speed: team and player pages usable on mobile mid-match.
- Readiness for v2: adding a "pick the winner" vote touches only new code, not the data model.

## Open questions for v2

- Voting mechanic (pick-winner, bracket, or ratings) — deferred by your call.
- Whether to add last-12-months club stats per player, which depends on the chosen API plan's depth.
- Commercial display rights on the API plan.
