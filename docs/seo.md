# SEO

*The rules every page follows. Drafted 29 June 2026. SEO is the top priority for this site; when SEO and any other concern conflict, SEO wins. This doc is how we make that concrete.*

## The principle

SEO is our only priority, and everything else — including UX — is judged by how it affects SEO. In practice that's less of a tension than it sounds: Google rewards exactly what users want (fast, readable, trustworthy, well-structured pages), so good UX *is* good SEO. Where they ever diverge, SEO is the tie-breaker.

The whole stack ([stack.md](./stack.md)) and architecture ([architecture.md](./architecture.md)) were chosen to serve this: static HTML, near-zero JS, content in pre-rendered HTML, fast global CDN.

## Non-negotiables (every page)

- **Server-rendered / pre-rendered HTML for all meaningful content.** Indexable content is never gated behind a client fetch. Only genuinely-live fragments may hydrate client-side, and only inside an already-rendered page (see rendering strategies in [architecture.md](./architecture.md)).
- **Unique, descriptive `<title>` and meta description** per page. Enforced via Content Collections frontmatter — the build fails if they're missing.
- **One `<h1>` per page**, then a sane heading hierarchy (`h2`/`h3`…). Headings describe content, not styling.
- **Canonical URL** on every page. One URL per piece of content; no duplicate-content ambiguity.
- **Clean, stable URLs.** Readable slugs, no IDs or query junk for content pages. Slugs don't change after publish (add a redirect if one truly must).
- **Structured data (JSON-LD)** appropriate to the page type — see below.
- **Open Graph + Twitter card** tags so shared links render well (drives clicks, which drives ranking).
- **`sitemap.xml`** generated at build (`@astrojs/sitemap`), drafts excluded.
- **`robots.txt`** allowing crawl and pointing to the sitemap.
- **Descriptive `alt` text on every image.**

## Structured data (JSON-LD)

Build a reusable JSON-LD component once and template it per page type. Bake it in from day one — it's what earns rich results, and sports content benefits a lot from it.

| Page type | Schema |
|---|---|
| Article / preview / review / analysis | `BlogPosting` (or `Article`) — headline, datePublished, dateModified, author, image |
| Match page | `SportsEvent` — competitor teams, start time, location |
| Site-wide | `Organization` / `WebSite` (with `SearchAction` if we add site search) |

Use real published/modified dates from frontmatter; never fake them.

## Performance — the Web Vitals budget

Fast pages rank. Our defaults protect this; the budget is:

- **Ship as little JS as possible.** Static by default; an island only where interactivity genuinely earns it. Preact keeps even those small.
- **Core Web Vitals targets:** good LCP, CLS near zero, low INP. Reserve space for images/embeds to avoid layout shift.
- **Images optimized and lazy-loaded** below the fold; modern formats; explicit dimensions.
- **No render-blocking junk.** No heavy third-party scripts without a hard SEO/measurable justification.
- **Global CDN delivery** (Cloudflare) for low TTFB everywhere.

## Content & internal linking

- **Internal links** between related articles, teams, and matches. Strong internal linking spreads ranking equity and keeps readers on the site.
- **Freshness signals:** set `updatedDate` when an article is meaningfully revised; the data plane keeps analytics pages current via rebuilds (fresh content ranks better for a live event).
- **Write for the search intent** of casual-to-seasonal fans — the questions they actually type — while staying entertaining. Generic-but-clear beats clever-but-obscure for discovery.
- **No SEO anti-patterns:** no keyword stuffing, cloaking, doorway pages, or thin duplicate content. We rank by being genuinely the fastest, clearest, best-structured free read on the topic.

## How this shows up in the build

- Frontmatter schema enforces title/description (and other SEO fields) — missing metadata fails the build, so nothing ships under-optimized.
- A shared SEO/head component centralizes title, meta, canonical, OG, and JSON-LD so every page is consistent and nothing is forgotten.
- Sitemap and robots are generated, not hand-maintained.

When in doubt on any decision — a feature, a layout, a script, a piece of copy — ask first: *does this make the page faster, clearer, more crawlable, or more linkable?* If not, it probably doesn't belong.
