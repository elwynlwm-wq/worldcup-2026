# Data warehouse — query requirements (spitball v0)

*Drafted 29 June 2026. The "what must we be able to answer instantly" list that drives the
schema. Not final — captured from the tech lead's first pass so the schema and sourcing
research target the right things.*

This folder is **pure data engineering**: crawl, clean, link, and store WC-2026 data as
queryable artifacts. It is **not** the runtime backend the app calls, and **not** the AI agent
that will query it. Those plug in later behind the provider seam (see `docs/architecture.md`).

## The query surface we want

What a person (or the future AI editor) must be able to ask the warehouse and get instantly:

1. **Head-to-head** — all-time country-vs-country record. *Derived from a match-history table,
   not stored separately.* Easy/cheap, low risk.
2. **Players, deep** — every player with: club, club-level record, **injuries**, tournament
   performance so far, and anything else useful. *Splits by difficulty:* roster/club = easy;
   performance stats = where paid earns its keep; **injuries = hardest, messiest, often a
   news signal more than a clean field** (see #5).
3. **Lineups / "ideal" starting XI** — store **actual lineups from played matches** (fetchable
   data). "Ideal/probable XI" is a **derived signal** we compute from recent starters + minutes,
   not a feed. A good example of "a signal others missed."
4. **Odds as a time series** — odds are not a single value; store **timestamped snapshots** at a
   sampling cadence (e.g. every 6h + one locked at kickoff) so we can tell "how the odds moved."
   "Cutoff at intervals" = the sampling/lock policy.
5. **Relevant news** — the connective tissue that turns data into stories. **Cannot republish
   article text (copyright)**; CAN store headlines/links/metadata and derive signals. This is the
   strongest candidate for a **paid** source (reliability + structure + clearer terms vs scraping),
   and it's also the most likely real home of trustworthy **injury** info.

6. **National-team ranking / WC seeding** — a rough ranking of every national team.
   *Already in hand, no new sourcing:* **FIFA World Ranking** is the official ranking AND what
   seeds the WC draw (pots come from it) → use for "official/seed" view. **Elo (eloratings.net)**
   covers all teams and is more predictive → use for "how good really." H2H/past-WC standings are
   **fallback/corroborating signals**, not the primary source (FIFA+Elo already cover everyone).

7. **Club strength tier** — for newbies: "what club is this player at, and is it any good?" is the
   fastest proxy for "is this player good?" Attach a coarse, legible **tier** (e.g. 1–5:
   Elite/Strong/Solid/Modest/Lower) to each player via their club, NOT a raw rating number.
   - Sources: **club Elo (clubelo.com)** + **UEFA club coefficients** + league tier.
   - **Hard part = global coverage.** WC squads include clubs worldwide (Saudi, MLS, Brazil,
     J-League); European-centric rankings get thin/absent outside the big leagues. Design for the
     gap: a coarse tier with a sensible fallback beats a precise-but-patchy number.
   - This is a **derived signal**: raw club Elo + league + competition → computed
     `clubStrengthTier`. Powers "plays for an elite club" on player pages and "Team A's XI averages
     'elite' vs Team B's 'solid'" comparisons — newbie-friendly, distinctive.

8. **Player strength by position (coarse tier, NOT exact rank)** — one level below club tiers.
   *Key difference:* teams/clubs are rankable on an objective signal (match results → Elo). Players
   are **not** — "how good is this defender" has no ground truth, so any player ranking is a
   constructed opinion, not a measured fact. Design accordingly:
   - **Decision: do coarse position tiers (e.g. Elite / Established / Squad / Prospect), NOT a
     precise #1–#N ranking.** A precise rank is a credibility liability (hardcore fans will mock a
     wrong list; newbies can't use the precision anyway and aren't our target). A coarse tier is
     defensible, legible, on-brand, and honest about its resolution.
   - **Derived signal**, same pattern as club tiers: blend caps + intl goals (we have) + the
     `clubStrengthTier` (a CB at an elite club ≈ a good CB) + minutes/role + age → `playerTier`
     per position. Composes nicely: "Brazil's XI: 3 elite, 5 established, 3 squad."
   - **Sourcing flags for the precise version (likely NOT usable):**
     - **EA Sports FC ratings** — comprehensive, position-based, newbie-familiar 0–99, BUT
       proprietary; republishing is a real legal risk, not grey. Expect: cannot use.
     - **Opta / StatsBomb / Sofascore performance ratings** — the legitimate, genuinely
       position-rankable data, but the most expensive in football and redistribution is tightly
       licensed. The "gated wins but costs real money" category.
   - Verdict to confirm with research: build our own coarse tier; treat bought player ratings as
     out of scope unless a source turns out to be both affordable and redistribution-safe.
   - **Why EA FC ratings are firmly out (decided 29 Jun):** they are NOT public/open data —
     they're EA's proprietary, copyrightable *editorial judgments* (subjective opinions expressed
     as numbers), not facts. Facts (caps, goals, club, results) aren't copyrightable and we use
     them freely; EA's ratings are. Crucially, because they're arbitrary subjective values, a
     like-for-like republish is *self-evidently* copying — there's no innocent way to land on EA's
     exact scale, so it's both illegal and trivially provable (this is how DB copying gets caught).
     Our own tier, derived from our own formula over facts, is original work and clean — and more
     on-brand (a signal we built, not a number we borrowed).

## The pattern this implies (working hypothesis, to confirm with research)

- **Cheap/free:** structured facts — H2H, rosters, lineups, ratings (Elo/FIFA).
- **Paid likely worth it:** the decision-driving, messy data — per-player **performance stats**,
  **injuries**, and **news**.

So "is a gated service worth paying for?" is probably **yes, selectively** — concentrated on
performance + injuries + news, not on the facts we can get free.

## Schema implications already visible

- Match history is the spine: H2H, lineups, results, events all hang off `Match`.
- Odds need a separate **time-series** table (snapshots with timestamps), not a column.
- News needs a **metadata-only** store (headline, url, source, published_at, derived tags/entities)
  — never full article bodies.
- "Ideal XI" and other **derived signals** are computed views over raw data, kept distinct from
  the raw facts they're built from.

## EA ratings as a private QA mirror (not a source) — decided 29 Jun

Allowed: use EA FC ratings **privately, manually** to sanity-check our own derived tiers ("we say
elite, EA says 58 — did our formula misfire?"). Internal comparison is not republication.
**Guardrail: EA is a mirror, not an input.** A discrepancy may prompt us to re-examine our own
working *via the facts* — it must NEVER be copied in or nudged toward, or we recreate the copying
problem (and correlation to EA's scale would prove it). Keep it informal/manual; do NOT build a
scraper that pulls EA's ratings DB (that scrape is itself a copy). QA practice, not a pipeline.

## Freshness is PER-FIELD, not per-source — the warehouse's most important property

A warehouse fed by stale data is just an expensive snapshot. Update cadence differs by data type
AND by source, so the pipeline must tag each field with a refresh tier (static / daily / live),
mirroring the old data-model.md tiering.

| Data | Cadence during WC | Source reality |
|---|---|---|
| Roster / club / league | ~static (players don't switch clubs mid-WC) | Free (Wikidata) fine |
| Fixtures / structure | static once drawn | Free (openfootball) fine |
| Results / scores | **live** | openfootball lags (manual, not a feed) → needs paid live |
| Match events / lineups | **live** | paid only (Sportmonks/BALLDONTLIE) |
| Tournament performance stats | **live** | paid only during play |
| Club-form / trailing-12-month stats | **frozen pre-tournament snapshot** | club season is over by June; static input, stale until next season |
| Injuries | **changes constantly** | free won't keep up → paid (BALLDONTLIE GOAT) or news-derived |
| Odds | **continuous** | The Odds API (its whole purpose) |

Implication: do NOT use one global refresh rate. "Rosters: daily from Wikidata" vs "live scores:
poll Sportmonks every ~15s during a match only" vs "club-form: frozen snapshot." The live job runs
ONLY during live matches (cost/rate-limit control), exactly as data-model.md's sync strategy says.

## Budget & live-tier plan (budget confirmed $100–200/mo)

- **Phase 1 (now):** free backbone — the static/slow fields (rosters, structure, H2H, ratings/tiers). $0.
- **During tournament:** add **Sportmonks Advanced (~€69)** + **The Odds API (~$30–59)** for the live
  tier (scores/events/lineups + odds). ~$110/mo in-window — inside budget — and this is what makes
  the warehouse live rather than a snapshot. Seasonal; subscribe only during the WC.

## Out of scope for this pass

Runtime API, Cloudflare Workers, the AI publishing/Q&A loop. Data acquisition + modeling only.
