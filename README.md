# World Cup 2026 — predictions, analysis & blog

A free, content-driven site for the 2026 World Cup: analysis, match previews and reviews, and predictions, plus a transparent forecast model. Aimed at casual-to-seasonal fans, not hardcore analysts — the goal is to be the most useful and entertaining free read on the tournament. **SEO is the top priority.**

## Where we're headed

The site is being built as **two planes** (see [docs/architecture.md](./docs/architecture.md)):

- **Content plane** — articles/blog, previews, reviews, analysis. Authored as **MDX in this repo**, pre-rendered to static HTML. No CMS, no backend for content; we edit pages and push.
- **Data plane** — live/derived football data (scores, standings, odds, model output). Served by a backend (Cloudflare Workers) because it changes as matches are played.

### Stack (chosen for now — see [docs/stack.md](./docs/stack.md))

Astro · Preact (islands) · MDX (Content Collections) · Tailwind + Typography · Cloudflare Workers (SSR host + data plane, reading D1).

## Docs

- [docs/architecture.md](./docs/architecture.md) — the two-plane architecture and rendering strategies. **Start here.**
- [docs/stack.md](./docs/stack.md) — the technology choices and why.
- [docs/content-authoring.md](./docs/content-authoring.md) — how to write articles (MDX, frontmatter, layouts, components).
- [docs/seo.md](./docs/seo.md) — the SEO rules every page follows.
- [docs/media-and-assets.md](./docs/media-and-assets.md) — where images/gifs/video live and why.
- [docs/product-spec.md](./docs/product-spec.md) — the **data plane** spec (entities, freshness, provider). Scope-noted.
- [docs/data-model.md](./docs/data-model.md) — the **data plane** SSOT schema. Scope-noted.

## Run it locally

```
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
```

## Repo layout

- `src/pages/` — routes (home, `/articles`, `/analysis`).
- `src/content/articles/` — the articles, as MDX. This is the content plane.
- `src/layouts/` — page templates. `src/components/` — the reusable component library.
- `src/content.config.ts` — the article schema (enforces SEO frontmatter at build time).
- `docs/` — the documentation above.

> The original single-file prototype (`index.html`, with the Elo model and baked-in
> tournament data) was removed when we migrated to Astro. It remains in git history at
> commit `5c2d34b` — that's where to look to **port the forecast model** (`GROUPS`,
> `RATINGS`, `predict()`, etc.) into the analysis section / data plane.

## Deploy

The site is a **Cloudflare Worker** (SSR via `@astrojs/cloudflare`), worker
`worldcup-2026-site`. Pushing code/content to `main` triggers `.github/workflows/deploy-site.yml`
(build → `wrangler deploy`). To deploy by hand: `npm run deploy` (build +
`wrangler deploy -c dist/server/wrangler.json`). The old Cloudflare **Pages**
project was retired at the SSR-from-D1 cutover.

## Working together

- Branch, commit, open a pull request.
- Content is in-repo MDX — edit and push; no CMS.
- Read the docs above (especially architecture and SEO) before adding features or pages.
- See [AGENTS.md](./AGENTS.md) for how an AI assistant should pick up changes between sessions.
