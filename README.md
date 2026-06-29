# World Cup 2026 — predictions, analysis & blog

A free, content-driven site for the 2026 World Cup: analysis, match previews and reviews, and predictions, plus a transparent forecast model. Aimed at casual-to-seasonal fans, not hardcore analysts — the goal is to be the most useful and entertaining free read on the tournament. **SEO is the top priority.**

**Live (prototype):** https://worldcup-site-ten.vercel.app *(the current single-file prototype; being migrated — see below)*

## Where we're headed

The site is being built as **two planes** (see [docs/architecture.md](./docs/architecture.md)):

- **Content plane** — articles/blog, previews, reviews, analysis. Authored as **MDX in this repo**, pre-rendered to static HTML. No CMS, no backend for content; we edit pages and push.
- **Data plane** — live/derived football data (scores, standings, odds, model output). Served by a backend (Cloudflare Workers) because it changes as matches are played.

### Stack (chosen for now — see [docs/stack.md](./docs/stack.md))

Astro · Preact (islands) · MDX (Content Collections) · Tailwind + Typography · Cloudflare Pages (hosting) + Workers (data plane).

## Docs

- [docs/architecture.md](./docs/architecture.md) — the two-plane architecture and rendering strategies. **Start here.**
- [docs/stack.md](./docs/stack.md) — the technology choices and why.
- [docs/content-authoring.md](./docs/content-authoring.md) — how to write articles (MDX, frontmatter, layouts, components).
- [docs/seo.md](./docs/seo.md) — the SEO rules every page follows.
- [docs/media-and-assets.md](./docs/media-and-assets.md) — where images/gifs/video live and why.
- [docs/product-spec.md](./docs/product-spec.md) — the **data plane** spec (entities, freshness, provider). Scope-noted.
- [docs/data-model.md](./docs/data-model.md) — the **data plane** SSOT schema. Scope-noted.

## Current state of the repo

- `index.html` — the original self-contained prototype (data + Elo prediction model + UI in one file). This is the **legacy prototype**, kept until its analysis is ported into the Astro site. It is no longer the source of truth.
- `vercel.json` — leftover from the prototype's Vercel hosting. **Superseded by Cloudflare** ([docs/stack.md](./docs/stack.md)); will be removed at scaffold.
- `docs/` — the documentation above.

The Astro project has not been scaffolded yet — these docs come first, by design (our team works through AI tooling, so the docs are the shared interface).

## How the prediction model works (prototype)

In `index.html`, all data is real but **baked in** (a snapshot, not a live feed):

- `GROUPS` — 48 teams, group standings.
- `SQUADS_RAW` — every squad: position, name, age, club, caps, goals.
- `RATINGS` — Elo + FIFA ranking per team (drives forecasts).
- `REAL_R32` / `REAL_RESULTS` — confirmed knockout ties and group scorelines.
- `predict()` — Elo expected score on an adjusted rating (Elo + tournament form + squad attack + host advantage) plus a draw term.

When ported, the live/derived parts of this become the data plane; the explanatory writing becomes content-plane articles.

## Deploy

Target is **Cloudflare Pages**: push to the repo → Cloudflare builds and deploys (branch/preview conventions set at scaffold). The current prototype still auto-deploys via Vercel until migration; don't add new work to the Vercel path.

## Working together

- Branch, commit, open a pull request.
- Content is in-repo MDX — edit and push; no CMS.
- Read the docs above (especially architecture and SEO) before adding features or pages.
- See [AGENTS.md](./AGENTS.md) for how an AI assistant should pick up changes between sessions.
