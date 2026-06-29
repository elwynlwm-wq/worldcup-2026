# Concept ↔ warehouse gap analysis

*Drafted 29 June 2026. Maps the "Kickabout" design concept (`concepts/Kickabout - World
Cup 2026.html`) against the planned data warehouse (`REQUIREMENTS.md`). Answers: what data does
the design already use, and what warehouse data is it leaving on the table?*

## The concept in one line

A polished, on-brand ("Kickabout": dark + yellow ball + orange accent; Archivo/Hanken Grotesk)
realization of our prototype — same Elo model underneath, much richer product. Nav: Today /
Matches / Stories / Teams / Bracket. It is **deliberately scoped to prototype-era data**, so it
under-uses what the warehouse will hold. That's the roadmap, not a flaw.

## Strong new ideas in the concept (adopt regardless of data)

- **Vote-then-reveal "Who do you think wins?" (Showdown panel)** — fans vote a matchup, see
  **fan % vs our model's pick** (model hidden until you vote). Best new idea here; it's the
  content-radar concept made concrete (votes = a signal). Votes saved to localStorage.
- **Stories linked to matches** — preview before / recap after, with read-time, date, per-type
  accent colors (preview=green, recap=orange, feature=blue).
- **Two-mode home** ("Pick how you like to follow along") — Stories view vs Matches view, saved.
- **Plain-English "power score"** explanation — well pitched at newbies.

These map onto what we've already built (model, predictor, teams, power ranking, bracket); adopting
the concept is mostly a **reskin + the voting/stories features**.

## Gap: warehouse data the design does NOT yet use

The design even admits it: *"Live tournament stats — minutes, goals this World Cup, match ratings
— would stream in from a live data feed. These figures are career international totals."*

| Warehouse data (REQUIREMENTS.md) | In concept? | UI opportunity it unlocks |
|---|---|---|
| **Head-to-head history** (#1) | ❌ | "Form between these two" panel on every matchup — supercharges the Showdown |
| **Live tournament stats** (#2) | ❌ (shows career totals as placeholder) | Real minutes/goals/ratings this WC |
| **Injuries** (#2) | ❌ | "Who's out" flags on team/match pages |
| **Lineups / probable XI** (#3) | ❌ | "Likely starting XI" on match previews |
| **Odds time-series** (#4) | ⚠️ model + fans only | Market odds as a third voice; "how the odds moved" |
| **News** (#5) | ⚠️ hand-written stories only | Auto-surfaced headlines as story seeds |
| **Club strength tier** (#7) | ❌ (shows club NAME only) | "plays for an elite club" — THE newbie feature |
| **Player position tier** (#8) | ❌ | "elite forward" badges; "Team A's XI: 3 elite, 5 established…" |
| National-team ranking (#6) | ✅ | Already shown as power score / FIFA rank |

## The single biggest gap

The concept shows **club name only** with **no sense of how good that club is**. The
club-strength-tier idea — the newbie's fastest proxy for "is this player good?" — is exactly
what's missing and exactly what the warehouse exists to power. Same for an **H2H** panel on the
Showdown.

## Priority order for wiring UI → warehouse data

1. **Head-to-head** — powers the Showdown, high impact, data is cheap/free to source.
2. **Club + player tiers** — the newbie killer feature; differentiates us.
3. **Injuries** — high value, poor coverage elsewhere (paid/news-derived).
4. **Live tournament stats / lineups** — replaces the career-totals placeholder during the WC.
5. **Market odds** — third voice alongside model + fans.

## Framing

The concept is the **v1 shell**; the warehouse is what **fills it with differentiated data**.
Build order: adopt the shell + voting/stories, then light up H2H → tiers → injuries → live stats.
