# World Cup 2026 — analytics & prediction site

A single-page site that helps fans see what's coming up at the 2026 World Cup and predict outcomes. It shows real squads, coaches, group standings and fixtures, and forecasts each match with a transparent model.

**Live:** https://worldcup-site-ten.vercel.app

## What's in here

- `index.html` — the whole site. Single self-contained file: data, prediction model and UI. This is the source of truth; edit this.
- `vercel.json` — static hosting config.
- `docs/product-spec.md` — what the site is for and how it's scoped.
- `docs/data-model.md` — the SSOT data model (entities, fields, provider interface).

## Run it

Open `index.html` in any browser. No build step.

## How it works

All data is real but **baked in** (a snapshot, not a live feed). Inside `index.html`:

- `GROUPS` — 48 teams, group standings (points, GD, status).
- `SQUADS_RAW` — every squad: position, name, age, club, international caps and goals.
- `RATINGS` — Elo rating + FIFA ranking per team (drives the forecasts).
- `REAL_R32` / `REAL_RESULTS` — confirmed knockout ties and group scorelines.
- `predict()` — the model: Elo expected score on an adjusted rating (Elo + tournament form + squad attack + host advantage), plus a draw term.

### Data sources

Squads and coaches: Wikipedia "2026 FIFA World Cup squads" + national-team pages. Standings: NBC Sports. Fixtures, results, venues: Sports Illustrated, Wikipedia. Ratings: eloratings.net and the FIFA world ranking. All current to late June 2026.

### Refreshing the data

The numbers don't update on their own. To refresh, update the `GROUPS`, `RATINGS`, `REAL_R32` and `REAL_RESULTS` constants in `index.html` from the sources above, commit, and push. (A live data API would automate this; see the spec.)

## Deploy

Connected to Vercel via Git: **every push to `main` auto-deploys** to the live URL, and pull requests get their own preview URL. Just commit and push.

## Working together

- Branch, commit, open a pull request. Vercel builds a preview for each PR.
- Keep all edits in `index.html` so there's one source of truth.
- See `AGENTS.md` for how an AI assistant should pick up changes between sessions.
