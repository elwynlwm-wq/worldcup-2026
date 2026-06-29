# Data sourcing — research findings & recommended stack

*Synthesized from the deep-research run on 29 June 2026 (raw report in `research-raw.json`).
Pricing verified that date — re-check before subscribing. This drives what crawlers we build.*

## The strategic finding

For a site that **republishes derived data publicly**, **licensing matters more than price** —
and the legally cleanest sources are free. The grey-area trap is paying for cheap data we're
then not licensed to publish.

## Source per category

| Category | Recommended source | License | Notes |
|---|---|---|---|
| Fixtures, schedule, structure, groups, stadiums | **openfootball/worldcup.json** | **CC0** (public domain, no key, no attribution) | Structure/schedule reliable; NOT a live-score feed |
| Squads, players, coaches | **Wikidata** (+ openfootball squads) | **CC0** structured data | Verify WC-2026 completeness/freshness |
| **Player → club → league** (signals backbone) | **Wikidata** | **CC0** | The key editorial relationship layer |
| Head-to-head (all-time) | **Reconstruct** from openfootball historical + Wikidata | CC0 | No single authoritative free H2H confirmed; derive it |
| Team ratings — FIFA ranking | Official FIFA ranking | facts | Already have a snapshot |
| Team ratings — Elo | **eloratings.net** (scrape) | **grey-area** (no API/license) | Low-risk facts; attribute; verify terms |
| Club strength tier (item 7) | **clubelo.com** + league tier | grey-area/facts | Coarse tier, not raw number; non-EU coverage is the gap |
| Player tier by position (item 8) | **Derive ourselves** | n/a | Build from caps + intl goals + club tier; do NOT buy ratings |
| Odds (time series) | **The Odds API** | **permits** commercial use in a content site (not as resold standalone product) | $30–59/mo; tournament window |
| Live scores / events / lineups | **Sportmonks WC API** | most redistribution-friendly paid terms (verify public-display) | €69 Advanced / €129 All-In; tournament only |
| Search-volume (content planning) | **UNRESOLVED** | — | Google Trends/pytrends unofficial+archived; needs its own look |

## Disqualified / avoid

- **API-Football (API-Sports)** — ToS **explicitly grants no publication license** and pushes all
  infringement liability onto us. Cheap, but disqualifying for a public republishing site.
- **FBref/Opta advanced free stats** — collapsed Jan 2026; only basic historical data remains.
  Confirms: precise advanced metrics are now gated/expensive → build coarse tiers ourselves.

## Where paid genuinely wins (and ONLY here)

Free CC0 sources are not live and carry no advanced metrics. Pay only for:
1. Real-time live scores (sub-15s)
2. Live events / lineups during matches
3. Aggregated odds + advanced metrics (xG, predictions)

## Operating principle: FREE to build, PAID (+ verified) to publish (decided 29 Jun)

Build-time and go-live are different risk regimes:
- **Building features (now):** developing privately — nothing indexed, no traffic. Free sources are
  fine to build/prove features against; the ToS *publishing* restrictions don't bite until we
  publicly serve data at scale. Build on our free CC0 stack (openfootball + Wikidata + clubelo) —
  it's already wired in AND legally clean even in dev.
- **Before go-live:** **trial several providers, cross-check them for accuracy**, then buy the most
  accurate one that ALSO grants publish rights. Cross-checking is good data engineering (catches
  errors) and the provider seam + sourceRefs design exists to support it.

**The rule: free to build, paid-and-verified to publish.** Do NOT ship publicly on a source whose
ToS denies publication rights (e.g. API-Football) — that risk grows precisely as an SEO site
succeeds. API-Football may be one of the *trial candidates* to compare accuracy pre-launch, but it
is not a publish source. (Paid tiers of API-Football do NOT grant publish rights — same ToS as free.)

## Recommended phasing

**Phase 1 — now (this data-engineering pass), $0/mo, legally clean:**
openfootball + Wikidata for squads/players/coaches/fixtures/structure/player-club-league;
reconstruct H2H; scrape Elo + clubelo for ratings/tiers (attribute). This is the whole backbone.

**Phase 2 — tournament window only (Jun–Jul), ~$40–130/mo, mostly avoidable:**
The Odds API (~$30) for the odds time-series; Sportmonks Advanced (€69) only if we want live
scores/lineups. Seasonal — subscribe only during the tournament.

## Caveats to respect

- CC0 covers Wikidata's copyright position but not facts imported from third parties with their
  own terms; openfootball/Wikidata WC-2026 freshness is "reliable for structure, verify for live."
- Sportmonks has internal ToS tension (permissive data clause vs restrictive website-material
  clause) — verify the public-display case directly before paying.
- BALLDONTLIE redistribution terms are genuinely unresolved — confirm before relying on it.
- Odds/sports-API pricing changes often — re-verify at subscribe time.

### Player avatars/photos — corrected (29 Jun)

Photos are copyrighted works (not facts) — cannot scrape/rehost. Per-provider reality:
- **BALLDONTLIE GOAT ($40/mo):** more data per dollar (injuries + odds + history) BUT player
  **photos are NOT in its verified feature list** (likely none) AND republication terms unresolved.
- **Sportmonks (€69+):** exposes a player `image_path` field AND has clear data-redistribution
  terms — but confirm **image display rights specifically** (image licensing can be carved out).
- **Regardless of provider:** generated avatars (initials/jersey, position-tinted) are the v1
  choice and the permanent fallback — no API covers 100% of 1,200 players, and it's free/safe.

v2 verification checklist before subscribing:
1. BALLDONTLIE — (a) public republication terms, (b) do photos even exist?
2. Sportmonks — player image *display* rights (not just data redistribution).

### Sportmonks has TWO products — don't confuse them (29 Jun)

- **General Football API** (league-tiered, year-round): Starter €29 (5 leagues) / Growth €99 (30) /
  Pro €249 (120) / Enterprise custom. EXPENSIVE for us because WC players span dozens of leagues —
  avoid using this just for World Cup coverage.
- **Dedicated WC 2026 API** (the one we want): flat **€69 Advanced / €129 All-In** for the whole
  tournament (all 104 matches), NOT per-league. This is what the v2 live-data plan is costed on.
- Gotcha: player **photos** may live in the general player-profile endpoint, not the WC product —
  so chasing avatars via Sportmonks could force a pricier general plan. Another reason generated
  avatars are the right call rather than paying up a tier for faces.

## Open questions to chase

- Elo + FIFA ranking: confirm scrape-ability and whether derived ratings are safe to republish.
- Search-volume: find a usable, licensable source (or accept Trends as planning-only, not published).
- All-time H2H: confirm openfootball historical + Wikidata can fully reconstruct verifiable records.
