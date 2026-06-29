# Stack

*The technology we've picked for now. Drafted 29 June 2026. None of this is locked forever — it's what we've decided at this stage and why. If we change a choice, update this doc and note it in the commit.*

## At a glance

| Layer | Choice | One-line why |
|---|---|---|
| Framework | **Astro** | Static-first, ships zero JS by default — fastest pages, best SEO |
| Interactivity | **Preact** (via `@astrojs/preact`) | React-fluent for our AI workflow, ~3KB instead of ~45KB |
| Content | **MDX** via Astro Content Collections | Markdown our AI writes natively, plus embeddable components |
| Styling | **Tailwind CSS + `@tailwindcss/typography`** | Fast to author, no runtime cost, polished article prose for free |
| Host | **Cloudflare Pages** | Free collaboration, same platform as our backend compute |
| Backend (data plane) | **Cloudflare Workers** (+ KV/D1 as needed) | Compute for live/derived data, same ecosystem, generous free tier |
| SEO tooling | sitemap, canonical URLs, JSON-LD structured data, OG images | Baked in from day one — see [seo.md](./seo.md) |

This stack serves the architecture in [architecture.md](./architecture.md): Astro is the content plane, Cloudflare Workers is the data plane.

## Framework — Astro

We chose Astro over Next.js because the site is content-first and SEO is our only priority.

- Astro renders to static HTML and **ships no client-side JavaScript unless we explicitly add it** (islands). That's the best possible starting point for Core Web Vitals and crawlability. With Next.js we'd be removing a React runtime we didn't want; with Astro we add interactivity only where it earns its place.
- Astro's **Content Collections** give us type-safe, schema-validated MDX — exactly the in-repo content model we want, no CMS.
- First-class Cloudflare support, and it does SSR / scheduled rebuild where the data plane needs it.

Where Next.js would win — a heavy interactive app shell, auth, personalization — we have none of that. If that ever changes, the islands model covers it without switching frameworks.

## Interactivity — Preact

Interactive pieces (prediction widgets, brackets, the ported Elo model, live score tickers) are built as **islands**: isolated interactive components dropped into otherwise-static pages.

We chose Preact over React and Vue specifically for our situation:

- **vs. Vue:** Vue is genuinely good, but our team works through AI tooling, and React-family code has far more training density — fewer hallucinated APIs, deeper library knowledge for charts/brackets/data-viz, less "which Vue version/API style is this." We move faster with the React family.
- **vs. React:** Preact uses the same JSX and hooks, so our AI writes it as React (near-zero learning/training penalty via `preact/compat`), but it ships ~3KB versus React's ~45KB. For an SEO-everything site that's free Web Vitals budget at no DX cost.

If we ever hit a library that genuinely needs real React, switching the Astro integration is essentially a one-line change.

## Content — MDX

Articles are MDX in Content Collections.

- Our AI reads and writes Markdown more reliably than any other format; MDX is a strict superset, so that fluency carries over.
- MDX lets a post embed components inline — a chart, a stat callout, a live widget — which an analysis/prediction site wants constantly. A post that uses no components is just Markdown, so there's one format to learn with full power when needed.
- Frontmatter is schema-validated at build time (Content Collections), so SEO fields and metadata can't silently go missing.

Layout and design freedom live in **layouts + a component library**, not in the MDX file — see [content-authoring.md](./content-authoring.md) for that model.

## Styling — Tailwind + Typography

- Tailwind: fast to build with, excellent for AI editing, zero runtime cost.
- `@tailwindcss/typography`'s `prose` classes give articles polished, readable typography with no per-post effort — ideal for content velocity.

## Host & backend — Cloudflare

- **Cloudflare Pages** for hosting: collaboration is free (Vercel is per-seat, which we don't want for a small team), and it puts hosting on the same platform as our backend compute.
- **Cloudflare Workers** (with KV and/or D1 as the data shape demands) for the **data plane** — fetching/normalising football data, caching, the model, and the internal API the live islands and rebuild pipeline read from. Generous free tier, one ecosystem.

Deploy model: push to the repo → Cloudflare builds and deploys. (Exact branch/preview conventions documented when we wire up the project.)

> Note: the repo currently contains `vercel.json` from the prototype phase. That is superseded by this Cloudflare decision and will be removed when we scaffold.

## Things we've deliberately not decided yet

- The football data provider for the data plane (the prior spec proposes API-Football; that still stands as the leading candidate — see [product-spec.md](./product-spec.md)).
- KV vs. D1 vs. both for data-plane storage — decided when we build it.
- Whether the ported Elo analysis page runs entirely client-side as an island or gets pre-computed by the data plane. Likely the latter as it matures.
