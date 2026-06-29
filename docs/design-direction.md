# Design direction — Kickabout

*Decided 29 June 2026. The visual/brand direction for the site, based on the "Kickabout" concept
(`concepts/Kickabout - World Cup 2026.html`). See `data-pipeline/CONCEPT-GAP.md` for the data
mapping behind it.*

## Decision: adopt Kickabout as a whole-site dark brand

- **Brand:** "Kickabout" — dark (`#16181d`), yellow ball (`#ffd23f`), orange accent (`#e8482b`);
  Archivo (display, heavy) + Hanken Grotesk (body). Bold, fun, on-brand for casual fans.
- **Scope: the whole site** — home, articles/blog, and analysis all in the unified dark theme
  (chosen over a light-blog / dark-analysis split for a stronger single brand).

## How we adopt it — rebuild natively, do NOT ship the concept file

The concept is a self-contained bundled prototype: a hash-router SPA, inline everything, fonts as
embedded blobs. **We do not ship it as-is** — that would reintroduce the exact problems we already
fixed:
- no real URLs (hash-router) → not crawlable → breaks SEO (our top priority)
- bypasses our static-first Astro setup, content collections, and provider seam

So: **treat the concept as the design spec.** Port the look (colors, fonts, card styles, the
Showdown panel) into our Astro layouts/components, keeping static-first rendering, real URLs, and
the warehouse-fed provider seam underneath. (Same approach that worked for the Elo prototype →
analysis migration.)

## The one design task to do deliberately

Whole-site dark means **articles are dark long-form**. Tune a legible dark reading experience:
generous contrast, dimmed-not-pure-white body text, comfortable measure. Don't just invert the
light `prose` — design it.

## Features to bring over from the concept

- **Vote-then-reveal "Who do you think wins?" (Showdown)** — fans vote a matchup, see fan % vs the
  model's pick (hidden until they vote). Best new feature; also a content-radar signal.
- **Stories linked to matches** (preview before / recap after).
- **Two-mode home** (Stories vs Matches view).
- Plain-English "power score" explanation.

## Sequencing (decided)

1. **First: wire warehouse data into the CURRENT site** — H2H panels + club/player tier badges from
   the v1 export. Lands data value on what already works.
2. **Then: Kickabout reskin as a separate pass** — restyle the (now data-wired) components to the
   brand, add the Showdown feature, tune dark article reading.

This order means the reskin restyles components already backed by real data, instead of doing both
at once.

## Live data source (decided 29 Jun)

The site now serves **API-Football (paid Pro)** data live: fresh fixtures/results/statuses and
player photos. This is the tech lead's explicit call to use the best data while building toward
launch.

**Accepted risk:** API-Football's ToS grants no publication license (tier-independent). We're
publishing its data pre-launch knowingly. Before public launch we must EITHER verify publish rights
OR swap to a license-clean source — the provider seam + the `af_*` warehouse namespace make that a
data-layer change, not a UI rewrite. The dev API key in `data-pipeline/.env` is to be rotated
before deploy. See `data-pipeline/SOURCING.md`.

## Migration to EXACT Kickabout design (plan — decided 29 Jun, on hold)

Decision: **adopt the prototype's exact design**, ported into our Astro architecture. Wait for the
incoming prototype update — do NOT restyle current pages against the stale concept (throwaway work).

When the updated prototype files land in `concepts/`:
1. Extract its exact design (real markup, layouts, spacing, Showdown/story/card components) — palette
   already done in Phase B.
2. Port component-by-component into Astro; discard its hash-router SPA shell, recreate its visual
   components. Keep our architecture (static, real URLs, warehouse-fed, provider seam).
3. Reuse existing data wiring — components already pull H2H/tiers/photos/fresh results, so it's
   restyling components that already have real data.
4. Fidelity: pixel-faithful to the updated prototype; our architecture is the only deviation.

Until the files are updated: **no styling work.** Keep building features/data against current brand.

## Team marks: two-tone vs flags (decided 29 Jun — wire after new design lands)

Use BOTH, by context density:
- **Two-tone diagonal color marks** (team's two primary colors) in DENSE/LIST contexts — power
  ranking, standings, fixtures, anywhere many teams appear. Clean, branded, trademark-free, tiny
  (CSS/SVG, zero image load → good for perf/SEO).
- **Real flags** where it narrows to ONE or TWO teams — team profile, Team A vs Team B matchup
  pages. Maximises recognizability (our newbie audience) where there's room.

Needs a curated **team-colors dataset** (48 teams, home/away primary+secondary). API-Football does
NOT expose national-team colors — build it ourselves / from Wikipedia. This same dataset powers the
AI banner generation, so it's a reusable asset, not a one-off. Build after the Kickabout design lands.
