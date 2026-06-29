# Notes for an AI assistant picking this up

This project is worked on by more than one person, mostly through AI tooling (Claude Code / Cowork). The docs are the shared interface — read them before changing anything.

Before making any change in a new session:

1. Run `git pull` to get the latest.
2. Run `git log --oneline -20` and `git diff` against your last known point to see what teammates changed.
3. Read `README.md` and `docs/architecture.md` so you understand the two-plane setup and don't undo someone's work.

## The one thing to internalize: two planes

The site is two planes (see `docs/architecture.md`):

- **Content plane** — articles/blog, in-repo **MDX**, pre-rendered to static HTML. Changes when a person writes something.
- **Data plane** — live/derived football data via a backend (Cloudflare Workers). Changes when matches are played.

When something is ambiguous, ask: *does this change because a person wrote it, or because a match happened?* That tells you which plane it belongs to.

## Ground rules

- **SEO is the top priority.** Every change is judged by its SEO effect, UX included. Follow `docs/seo.md`. Meaningful content must be in pre-rendered HTML; only genuinely-live fragments may be client-fetched islands.
- **Content is in-repo MDX**, authored with frontmatter (schema-validated — missing SEO fields fail the build). See `docs/content-authoring.md`. Don't build a CMS or fetch article bodies from a backend.
- **Don't hand-style inside MDX.** New looks go in layouts/components (`docs/content-authoring.md`), not inline in articles.
- **Don't copy volatile data into prose.** Live/derived numbers (scores, odds, model output) come from the data plane via components, not hand-typed, or they go stale.
- **Stack is Astro / Preact / MDX / Tailwind+Typography / Cloudflare** (`docs/stack.md`). Interactivity is Preact islands, added only where it earns its place.
- **The forecast model is a transparent heuristic** (Elo + form + squad + host). Keep it explainable; if you change weighting, note it in the commit and the relevant doc.
- **All displayed data must be real.** If real data isn't available, show a clear "not available yet" state rather than inventing numbers.

## Current state

- The Astro site is **not yet scaffolded** — docs come first by design.
- `index.html` is the **legacy prototype** (single-file data + Elo model + UI), kept until its analysis is ported into Astro. Not the source of truth anymore. Don't add new features to it.
- `vercel.json` is leftover and superseded by Cloudflare; it will be removed at scaffold.
- `docs/product-spec.md` and `docs/data-model.md` are the **data plane's** spec/schema (scope-noted at the top), not the whole site.

## Deploy

Target is **Cloudflare Pages** (push to deploy; conventions set at scaffold). The prototype still auto-deploys via Vercel until migration — don't add new work to the Vercel path, and don't deploy with a personal token.

## Common task: write an article

Add an MDX file under the content directory with valid frontmatter (title, description, slug, date, etc.), following `docs/content-authoring.md` and `docs/seo.md`. Use components for anything beyond prose; pull live data from the data plane, never hand-copied. Verify it builds, commit with a clear message, push.

## Common task: refresh prototype data (until migration)

In `index.html`, update `GROUPS`, `RATINGS`, `REAL_R32`, `REAL_RESULTS` from the sources in `README.md`, verify the page renders, commit, push.
