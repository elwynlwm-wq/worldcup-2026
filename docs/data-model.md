# World Cup SSOT — data model (v1)

*Companion to the product spec. FIFA Men's World Cup 2026.*

> **Scope note (added 29 June 2026).** This is the **data plane's** schema (see [architecture.md](./architecture.md)). It describes the live/derived football data served by the backend (Cloudflare Workers), not the editorial content plane — articles live in the repo as MDX and are not modelled here (see [content-authoring.md](./content-authoring.md)). Everything below — entities, `sourceRefs`, freshness tiers, the provider abstraction, the sync strategy — still stands as the data plane's design.

## Principles

The schema describes one tournament's worth of football, normalised so the frontend reads one consistent shape regardless of which API supplies it. Three rules shaped every decision below.

Provider independence: nothing in the model assumes API-Football's field names. Each entity carries a `sourceRefs` map (provider name to that provider's ID) so we can match records across providers and swap suppliers without changing the frontend.

Tournament-agnostic: although v1 loads only 2026, every entity hangs off a `Tournament` so a second tournament can be added without schema changes.

Freshness-aware: each entity is tagged with the refresh tier from the spec (live, daily, static), which drives the sync layer.

Identifiers are our own stable internal IDs (a slug or UUID), not the provider's. Provider IDs live only in `sourceRefs`.

## Entity overview

```
Tournament ──┬── Group ──── (standings reference Teams)
             ├── Team ──┬── Player ──── PlayerTournamentStats
             │          ├── Coach
             │          └── Injury (also links to Player)
             └── Match ──┬── MatchTeamStats (one per side)
                         ├── MatchPlayerStats (one per player who featured)
                         └── MatchEvent (goals, cards, subs)
```

## Tournament

Static. One row in v1.

```
Tournament {
  id: string                 // "fifa-wc-2026"
  name: string               // "FIFA World Cup 2026"
  type: "mens" | "womens"
  year: number
  hosts: string[]            // ["USA", "Canada", "Mexico"]
  startDate: date
  endDate: date              // 2026-07-19
  currentStage: enum         // "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final" | "completed"
  numTeams: number           // 48
  format: {
    numGroups: number        // 12
    teamsPerGroup: number    // 4
    qualifyPerGroup: number  // 2
    bestThirdPlaceQualifiers: number  // 8
  }
  sourceRefs: { [provider: string]: string }
}
```

`currentStage` lets the home page and bracket know what to foreground. It updates daily, or on the day a stage starts.

## Group

Daily. Twelve groups. Standings are derived from matches but stored, because the API computes tie-breakers (including FIFA 2026's conduct/fair-play score) that we don't want to recompute.

```
Group {
  id: string                 // "wc2026-group-a"
  tournamentId: string
  name: string               // "Group A"
  standings: GroupStanding[]
  sourceRefs: { ... }
}

GroupStanding {
  teamId: string
  rank: number               // 1-4 within group
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  conductScore: number       // FIFA 2026 fair-play tiebreaker
  qualified: "winner" | "runner_up" | "best_third" | "eliminated" | null
}
```

`qualified` is the field that encodes the 48-team format's awkward bit: third-placed teams that advance are marked `best_third`. The bracket reads this to fill knockout slots.

## Team

Mostly static, standing-related fields daily.

```
Team {
  id: string                 // "brazil"
  tournamentId: string
  name: string               // "Brazil"
  shortCode: string          // "BRA" (FIFA 3-letter)
  confederation: enum        // "UEFA" | "CONMEBOL" | "CONCACAF" | "CAF" | "AFC" | "OFC"
  groupId: string
  flagUrl: string
  fifaRanking: number | null
  coachId: string
  squad: string[]            // Player ids
  knockoutStatus: enum | null  // mirrors currentStage reached / "eliminated"
  aggregateStats: TeamAggregateStats   // rolled up across the tournament
  sourceRefs: { ... }
}

TeamAggregateStats {        // derived, refreshed daily
  matchesPlayed: number
  goalsFor: number
  goalsAgainst: number
  avgPossession: number | null
  totalShots: number | null
  totalxG: number | null    // null if provider doesn't supply xG
  cleanSheets: number
}
```

Anything the provider may not return (xG especially on cheaper plans) is nullable. The UI must render gracefully when a stat is absent rather than showing zero.

## Coach

Static.

```
Coach {
  id: string
  teamId: string
  name: string
  nationality: string
  dateOfBirth: date | null
  appointedDate: date | null
  photoUrl: string | null
  tournamentRecord: {
    matchesManaged: number
    wins: number
    draws: number
    losses: number
  }
  sourceRefs: { ... }
}
```

Coach data is the thinnest in most APIs, so several fields are nullable. API-Football has a coaches endpoint; confirm depth on the chosen plan.

## Player

Profile static, stats daily.

```
Player {
  id: string
  teamId: string
  name: string
  position: enum             // "GK" | "DF" | "MF" | "FW"
  detailedPosition: string | null   // "CB", "RW", etc., if provided
  shirtNumber: number | null
  dateOfBirth: date | null
  age: number | null
  heightCm: number | null
  club: string | null        // domestic club
  clubCountry: string | null
  photoUrl: string | null
  tournamentStats: PlayerTournamentStats
  recentForm: ClubFormSummary | null   // last 12 months at club, if plan supports
  currentInjuryId: string | null       // points to active Injury, else null
  sourceRefs: { ... }
}

PlayerTournamentStats {     // this tournament only, refreshed daily
  appearances: number
  minutes: number
  goals: number
  assists: number
  shots: number | null
  shotsOnTarget: number | null
  passAccuracy: number | null
  yellowCards: number
  redCards: number
  avgRating: number | null  // average match rating where the API gives ratings
}

ClubFormSummary {           // optional, depends on API plan
  period: string            // "2025-26 club season"
  appearances: number
  goals: number
  assists: number
  avgRating: number | null
}
```

`recentForm` is the pre-tournament-form signal the spec calls out. It's optional because it depends on the API plan exposing club data. Build the UI to show it when present and hide the section when not.

## Injury

Daily, and the highest-value signal for the "who will win" question, so it's a first-class entity with its own board.

```
Injury {
  id: string
  playerId: string
  teamId: string
  status: enum               // "out" | "doubtful" | "recovered"
  type: string | null        // "hamstring", "knock", etc.
  reportedDate: date
  expectedReturn: date | null
  source: string | null      // attribution where the API gives it
  sourceRefs: { ... }
}
```

A player's `currentInjuryId` points to the active record; resolved injuries stay in the table for history but flip to `recovered`.

## Match

Live during play, daily otherwise. The richest entity.

```
Match {
  id: string
  tournamentId: string
  stage: enum                // "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final"
  groupId: string | null     // set for group games only
  bracketSlot: string | null // knockout position, e.g. "r16-m3", for tree rendering
  kickoff: datetime
  venue: string | null
  city: string | null
  status: enum               // "scheduled" | "live" | "halftime" | "finished" | "postponed"
  minute: number | null      // live clock
  homeTeamId: string
  awayTeamId: string
  homeScore: number | null
  awayScore: number | null
  penalties: { home: number, away: number } | null  // knockouts only
  lineups: { home: Lineup, away: Lineup } | null
  teamStats: { home: MatchTeamStats, away: MatchTeamStats } | null
  events: MatchEvent[]
  sourceRefs: { ... }
}

MatchTeamStats {
  possession: number | null
  shots: number | null
  shotsOnTarget: number | null
  corners: number | null
  fouls: number | null
  xG: number | null
  passAccuracy: number | null
}

MatchEvent {
  minute: number
  type: enum                 // "goal" | "own_goal" | "penalty" | "yellow" | "red" | "subst" | "var"
  teamId: string
  playerId: string | null
  relatedPlayerId: string | null  // assist, or player subbed off
}

Lineup {
  formation: string | null   // "4-3-3"
  startingXI: string[]       // Player ids
  substitutes: string[]
  players: MatchPlayerStats[]
}

MatchPlayerStats {
  playerId: string
  minutesPlayed: number
  rating: number | null
  goals: number
  assists: number
  // extend as the plan allows
}
```

`bracketSlot` is what lets the bracket page render the tree without recomputing who plays whom. The sync layer fills it from the format rules once knockout pairings are known.

## How freshness maps to entities

| Tier | Entities | Refresh |
|---|---|---|
| Live | Match (status live only), its events, lineups, scores | 30–60s, during live matches only |
| Daily | Group standings, Team aggregates, Player stats, Injury, Coach record, Tournament.currentStage | scheduled, a few times a day |
| Static | Tournament, Team metadata, Player/Coach profiles | once a day |

The sync layer should never poll live for an entity that isn't in a live match. This is what keeps the API request count under the daily cap.

## Provider abstraction

One adapter per provider implements a common interface, so the rest of the system only ever sees SSOT entities.

```
interface FootballDataProvider {
  getTournament(): Tournament
  getGroups(): Group[]
  getTeams(): Team[]
  getSquad(teamId): Player[]
  getCoach(teamId): Coach
  getInjuries(): Injury[]
  getFixtures(): Match[]      // scheduled + finished
  getLiveMatch(matchId): Match
}
```

Write `ApiFootballProvider` first. A `SampleProvider` returning the same shapes from static JSON powers the prototype (and local development) with no API key. Swapping to Sportmonks later means writing `SportmonksProvider` against the same interface and changing one config value. The `sourceRefs` map on every entity is what lets a future migration reconcile IDs between providers.

## Sync strategy

A scheduled job per tier. The static and daily jobs run on cron. The live job activates only when a match's `kickoff` has passed and `status` is not `finished`, polls that match alone, and deactivates on `finished`. Each job writes normalised entities into the cache/store; the frontend reads only from there, never from the provider directly. This centralises the API key, the rate-limit budget and the caching, and makes provider swaps invisible to the UI.

## Leaving room for v2 (voting)

Nothing voting-related ships in v1, but the model anticipates it so v2 is additive. Two new entities and a user reference would cover all three voting mechanics from the spec without touching anything above:

```
Vote {                       // v2 — not built in v1
  id: string
  userId: string             // or anonymous session id
  tournamentId: string
  type: "winner" | "bracket" | "rating"
  payload: json              // teamId, or bracket map, or {entityId, stars}
  createdAt: datetime
}

VoteAggregate {              // v2 — derived tallies for display
  tournamentId: string
  type: string
  results: json              // e.g. { teamId: voteCount }
  updatedAt: datetime
}
```

Because votes reference existing `Team`, `Player` and `Match` IDs, the read-side data model needs no changes when voting arrives. That was the design goal.
