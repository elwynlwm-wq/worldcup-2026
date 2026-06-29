# Content authoring

*How we write articles. Drafted 29 June 2026. Reflects our current approach; expect the component library and frontmatter fields to grow.*

Our staff write content with AI help (Claude Code / Cowork) and push to the repo. There is no CMS by design — the repo is the CMS, and these conventions are what keep it consistent.

## The mental model: document vs. design

Think of it the way LaTeX splits a document from its class/style:

- The **MDX file** is the document — prose, frontmatter, and calls to components. It carries *what* the page says.
- **Layouts + the component library** are the style — they decide *how* it looks.

This split means an MDX file never limits layout possibilities. Distinctive per-page designs (a magazine-style match preview, a data-dense breakdown, a standard blog post) come from layouts and components, not from cramming styling into the article. Authors compose; the templates typeset.

Three levers give full control:

1. **Layouts** — a post picks one via frontmatter (`layout:`). Different layout = different page architecture (hero, grid, sidebars, type scale).
2. **Components** — a curated library exposed to MDX (`<StatCallout />`, `<Hero />`, `<TwoColumn />`, charts, brackets). Authors drop them into prose.
3. **Markdown overrides** — plain markdown elements (headings, blockquotes, links) can be globally routed through our own components, so even a post with zero explicit components still gets our typesetting.

Components can be interactive Preact islands, so a "macro" in our world can be a live widget — something static typesetting could never do.

## Where things live

```
src/
  content/        # the articles — MDX, checked into the repo
  layouts/        # page templates (the "classes")
  components/     # the reusable component library (the "macros")
```

(Exact paths confirmed at scaffold; this is the intended shape.)

## Frontmatter

Every article carries schema-validated frontmatter. The schema (Astro Content Collections) **fails the build** if required fields are missing — that's deliberate, so SEO metadata can't silently disappear. Expected fields (final list set at scaffold; SEO fields are non-negotiable — see [seo.md](./seo.md)):

```yaml
---
title: "Why Brazil Could Stumble in the Group Stage"   # also the <h1> / SEO title
description: "..."          # meta description + social preview; required
slug: "brazil-group-stage"  # stable URL; don't change after publish
publishDate: 2026-06-29
updatedDate: 2026-06-30      # optional; set when meaningfully revised
author: "..."
tags: ["brazil", "group-stage", "analysis"]
ogImage: "..."              # social/OG image; generated if omitted
pageStyle: "standard"       # which layout to render with (not "layout": MDX reserves that key)
draft: false                # drafts are excluded from build/sitemap
---
```

## Authoring rules

- **One format: MDX.** A post with no components is just Markdown — that's fine and common. Reach for components when prose alone won't show the point (odds, comparisons, brackets).
- **Don't hand-style in the article.** Need a new look? Add or extend a layout/component, don't inline styles into MDX. Keeps articles portable and the design consistent.
- **Slugs are forever.** Once published, a slug is a URL people and Google know. Changing it breaks links and loses SEO equity. If you must, add a redirect.
- **Write for the audience:** casual-to-seasonal fans, not hardcore analysts. Entertaining first; a little generic is acceptable. Every choice still ranks on SEO — see [seo.md](./seo.md).
- **Drafts:** `draft: true` keeps a post out of the build and sitemap until ready.
- **Data belongs to the data plane.** If content needs live/derived numbers (odds, scores, model output), pull them via a component that reads the data plane — don't hand-copy volatile numbers into prose, or they'll go stale. Evergreen facts in prose are fine. See [architecture.md](./architecture.md).

## Adding to the component library

When a post needs a new visual or interactive piece, add it to `components/` as a reusable, named component rather than a one-off. Build it as a static Astro component unless it genuinely needs interactivity, in which case make it a Preact island. The goal is a small, expressive "package" of building blocks that makes the next article faster to write.
