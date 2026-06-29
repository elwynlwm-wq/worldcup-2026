# Architecture

*How the site is put together. Drafted 29 June 2026. This reflects the approach we've chosen for now; it will evolve as the tournament and the site do.*

## The one idea to hold onto

The site is **one product made of two planes** that behave very differently, and we keep them separate on purpose.

- **Content plane** — articles, previews, reviews, analysis writing. This changes when a human (with AI help) writes something. It lives in the repo as MDX and is pre-rendered to static HTML.
- **Data plane** — scores, standings, odds, model outputs. This changes because matches are played, not because anyone edits a file. It needs compute, and is served by a backend.

Almost every decision in these docs falls out of which plane a thing belongs to. When something feels ambiguous, ask: *does this change because a person wrote it, or because a match happened?* That answers where it goes.

## Why two planes

SEO is our top priority, and the fastest, most crawlable page is static HTML with no work to do at request time. Most of the site (the writing) can be exactly that. But some of the site is genuinely live — odds move, scores tick, results lock when a match ends — and pretending that's static would mean stale pages.

So we don't force one model onto both. We let the content plane be static (which is where it's strongest) and give the data plane real compute (which is where it needs it), and we make sure the dynamic data **doesn't drag dynamic HTML along with it** (see rendering strategies below). That's how the analytics pages stay as SEO-strong as the articles.

## Content plane

- **Source of truth:** MDX files checked into this repo.
- **Scale we're designing for:** on the order of 100 articles. This is comfortably static — Astro builds hundreds of pages in seconds-to-low-minutes, and Git handles a few hundred markdown files without strain.
- **No backend for content.** Fetching article bodies from a backend would add latency, a failure mode, and would *hurt* SEO (a fetched body is worse for crawlers than pre-rendered HTML). We'd only revisit this at a very different scale — thousands of articles, non-technical editors needing a CMS, heavy concurrent editing — none of which is us right now.
- **Authoring:** staff write MDX with AI assistance and push. Cloudflare builds and deploys. See [content-authoring.md](./content-authoring.md).

## Data plane

The genuinely live/derived data: standings, fixtures and results, evolving odds, the prediction model's outputs, post-match locked numbers.

- **Needs compute** because it changes on its own schedule (matches, the clock) and some of it is derived (the model). A backend owns fetching from the upstream football data source, normalising it, caching it, and exposing a clean internal shape.
- The detailed design for this plane — entities, the provider abstraction, freshness tiers, sync strategy — already exists and is preserved in [product-spec.md](./product-spec.md) and [data-model.md](./data-model.md). Read those as **the data plane's spec.** They predate this two-plane framing and were written assuming the whole site was data-driven; the parts about a provider abstraction, SSOT schema, freshness tiers and sync jobs are exactly the data plane and still apply. The parts that imply the *whole* site is an API-fed app are superseded by this document.
- **Platform:** Cloudflare. Workers for compute, with KV/D1 for cache/storage as needed, on the same platform as hosting. (Specifics chosen when we build the data plane; not all of it ships first.)

## Rendering strategies — the part that keeps analytics SEO-strong

Dynamic *data* does not require dynamic *HTML*. We have three strategies and we pick per page (or per fragment) by how fast the content actually changes:

| Strategy | Use for | How it serves | SEO |
|---|---|---|---|
| **Static (SSG)** | Articles, evergreen pages | Pre-rendered at build, served from CDN | Best |
| **Scheduled / on-event rebuild** | Standings, post-match results, odds that lock after a match | Re-rendered to static HTML on a cron or a webhook when data changes, then served from CDN | Best — it's still static HTML to the crawler |
| **Live island** | Genuinely in-the-moment bits (in-match score ticker) | Static HTML shell pre-rendered; a small Preact island hydrates and fetches the volatile number client-side | Strong — all SEO-relevant content is in the shell; only the live number is JS |

The rule that protects SEO: **the meaningful, indexable content of a page is always in the server-rendered/pre-rendered HTML.** Only the truly-volatile fragment is allowed to be client-fetched, and even then it sits inside an already-rendered page. We never gate primary content behind a client fetch.

This is why an analytics page that updates several times a day should use **scheduled/on-event rebuild**, not client fetching — it gets the freshness of the data plane with the crawlability of a static page.

## How the planes meet

The static site (content plane) is what gets deployed and served. Where a page needs live data, it either:

1. is rebuilt by the data plane's pipeline when the data changes (preferred — keeps it static), or
2. embeds a live island that reads from the data plane's internal API at runtime (only for the genuinely live fragment).

The frontend never talks to the upstream football provider directly — only ever to our own data plane. That keeps the API key, rate-limit budget, caching, and any provider swap on the backend, invisible to the pages.

## What this means in practice

- Writing an article → add an MDX file, push. Static, instant, no backend involved.
- A match finishes and odds lock → the data plane updates; affected analytics pages rebuild to static HTML.
- A match is live → the page is already there; a small island updates the score in place.

See [stack.md](./stack.md) for the concrete technology choices and [seo.md](./seo.md) for the SEO rules every page follows.
