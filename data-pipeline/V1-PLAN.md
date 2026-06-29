# Warehouse v1 — plan

*Drafted 29 June 2026. The smallest warehouse that proves the architecture end-to-end and unlocks
the top UI features. Builds on REQUIREMENTS.md, SOURCING.md, CONCEPT-GAP.md.*

## v1 goal

Produce a clean, queryable, **linkable** dataset from FREE sources, and compute the two
highest-value **derived signals** — head-to-head records and club/player strength tiers — so the
app can light up the concept's most differentiated features. **No paid sources, no live feeds, no
runtime backend.**

## Scope — IN

- **Linkable schema:** players → clubs → leagues → teams → matches (so H2H + tiers are queries).
- **Fetchers** (idempotent, re-runnable) for free CC0/grey sources: openfootball, Wikidata, clubelo.
- **Normalize + link** build step → the warehouse.
- **Two derived signals computed:** (1) head-to-head records, (2) club + player strength tiers
  (coarse, our own formula — proves the "derive our own signals, never copy" pattern).
- **App-consumable output** wired to the existing provider seam (`src/lib/provider.ts`).

## Scope — OUT (v2+)

Live scores/events/lineups, odds time-series, news, paid sources (Sportmonks/Odds API),
injuries (needs paid/news), the AI publishing loop, any runtime backend / serverless functions.

## Runtime

**TypeScript (Node).** Same toolchain as the Astro site; can share types with `src/lib`. SQLite
via `better-sqlite3` for build-time queries.

## Storage decision — SQLite build + JSON export now; Neon later (NOT v1)

The data is tiny (single-digit–low-tens of MB: 48 teams, ~1,200 players, few-thousand clubs, intl
match history). The real fork is build-time vs serving:

- **Build-time warehouse → SQLite (local file).** Perfect for deriving H2H/tiers via joins. Zero infra.
- **Serving store → Neon (Postgres) — but only in v2**, when there's LIVE, MUTATING data (odds,
  scores) that a serverless function must read/write at request time. That's what Neon solves
  (serverless Postgres pooling). v1 has no live data and no backend, so Neon now = infra ahead of need.

**v1 path:** pipeline derives everything in SQLite → exports the slices the app needs as static
JSON committed to the repo → Astro reads them at build via the provider seam. Zero new infra,
lights up H2H/tier features immediately.

**v2 path:** introduce Neon as the serving store for the mutating tier behind a Vercel/Cloudflare
function; pipeline gains a "load warehouse → Neon" step. The provider seam means the app doesn't
care which source backs it.

Rule: **Neon earns its place the moment data mutates at request time and a serverless function must
read it. Until then it's cost/complexity serving static facts.** Never embed the full DB in a
function bundle — query Neon or read pre-built JSON.

**Decided 29 Jun: SQLite + JSON export for v1; Neon in v2.** No infra ahead of need; the provider
seam makes the later Neon swap a serving-layer change, not a rebuild.

## Data flow & the git/binary problem (decided 29 Jun)

Flow:
```
fetchers → SQLite warehouse (queryable source of truth)
   ├─ "analyzer" re-runs queries → exports JSON slices → static site renders teams/players
   └─ AI/analyst queries SQLite directly (ad-hoc) to research & write blogs
```
Both consumers read the SAME SQLite. JSON is a **rendering cache** derived from the DB, not a
second source of truth.

**The problem (correctly flagged): never commit the SQLite file to git.** SQLite is one binary
file; git stores every version in full forever, so a ~15MB DB updated daily bloats history by
~15MB per push even for a 3-row change. Same issue as video in `media-and-assets.md`.

**Solution — split the three artifacts by how they change:**

| Artifact | Changes | Where |
|---|---|---|
| Fetchers + build scripts + schema.sql (code) | rarely | **git** (source, diffs cleanly) |
| `warehouse.db` (SQLite) | every refresh, binary | **NOT git** — gitignored, rebuildable, mirror to **R2** |
| Exported JSON the site renders | derived | **git** for v1 (text, diffs; build stays simple) |

- DB is a **build artifact, not a precious file**: `build:warehouse` regenerates it from fetchers.
  Shared/served via **Cloudflare R2** (overwrite, no history bloat) — already our object-storage choice.
- JSON committed for v1: diffs cleanly ("goals 3 → 4"), keeps the static Astro build dead simple,
  small volume. Revisit (fetch JSON from R2 at build) only if updates get frequent.
- Reproducibility caveat: for sources that mutate, fetchers should also snapshot their raw pull to
  R2 so a rebuild is reproducible. v1 nice-to-have.

Net: the expensive-to-version binary never touches git; only its cheap diffable derivative (JSON)
and the code do.

## Proposed layout

```
data-pipeline/
  sources/      raw fetched data (gitignored or committed snapshots)
  fetch/        one fetcher per source (openfootball, wikidata, clubelo)
  build/        normalize + link + derive (H2H, tiers)
  warehouse/    output: warehouse.db (SQLite) + exported JSON slices
  schema.sql    the linkable schema
```

## First-pass sources (finalized 29 Jun) — ZERO API keys

All keyless HTTP/CSV. No signups for v1 (paid keys are a v2/tournament concern).

| Source | Role | Access | Key? |
|---|---|---|---|
| Our snapshot (`src/data/raw.ts`) | Roster base: 48 squads + Elo/FIFA ratings (already verified) | in-repo | have it |
| **openfootball/worldcup.json** | WC2026 fixtures, structure, groups, stadiums | GitHub raw JSON | none |
| **clubelo.com** | Club strength ratings → club/player tiers | public CSV/HTTP | none |
| **martj42/international_results** | All-time intl results (~48k matches, 1872–present) → **full all-time H2H** | single CSV (GitHub/Kaggle) | none |

Decision notes:
- Use the **snapshot as roster base** (not Wikidata) for v1 — sidesteps Wikidata entity-matching,
  the hardest part. **Wikidata deferred to a later enrichment pass** (player→club→league refresh).
- **Full all-time H2H** chosen → openfootball (WC-only) is insufficient alone, so add the
  **martj42 international_results** CSV. H2H becomes a GROUP BY over that table.
- Known limitation: all-time results have era/name messiness (USSR, Yugoslavia, renamed nations).
  v1 maps current nations; predecessor-state handling is a noted limitation, not fully modeled.

## Build order

1. schema.sql (linkable entities)
2. openfootball fetcher (fixtures/structure/squads — the spine)
3. wikidata fetcher (players, player→club→league)
4. clubelo fetcher (club ratings)
5. normalize + link → SQLite
6. derive H2H records
7. derive club + player tiers (our formula)
8. export JSON slices + wire to provider seam

## Deferred to v2 / data plane (Cloudflare Worker backend)

When we stand up the CF Worker backend (for genuinely dynamic data — live scores, odds), fold in:

- **H2H via backend, by SEO need (decided 29 Jun).** H2H has two consumers:
  - *Overview featured forecast* (one fixed matchup): **stays static / pre-rendered** — it's
    SEO-valuable copy that must be in the crawlable HTML.
  - *Predict island* (any of 1,706 pairs, user-driven, not indexed anyway): **switch to backend
    fetch** — drops the ~25KB inlined `h2h-by-team.json` from the page for zero SEO cost. The
    provider seam makes this a one-line swap (island calls `getH2H(a,b)` → Worker instead of inlined).
  - Rule: static pre-render where indexed; backend fetch where interactive. Don't move static,
    indexed data to backend (adds a round-trip + failure mode + SEO risk for no gain).
- **Live tiers (paid sources):** Sportmonks/Odds API during the tournament window.
- **Wikidata enrichment:** explicit player→league names (deferred from v1).
