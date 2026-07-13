# Hourly data pipeline → Cloudflare D1 (writer data source)

The pipeline runs **hourly** via GitHub Actions and produces two things:

1. **Site data** — curated JSON in `data-pipeline/warehouse/export/*.json`, committed to
   git and consumed at build time. The site is redeployed each run.
2. **Writer data** — the **full** warehouse, published to a **Cloudflare D1** database.
   The editorial/writer agents read D1 as the single live source of truth (no stale
   downloadable copies).

Workflow: `.github/workflows/hourly-refresh.yml`
Fetch (REFRESH=1) → build warehouse → export JSON → commit JSON → publish D1 → build site → deploy.

## One-time setup

### 1. D1 database (done)

Already created: **`worldcup-site`** (`fa7b603e-53e3-450f-adc4-a1e3133adaaa`), wired in
`wrangler.toml`. The pipeline publishes to it via `npm run publish:d1` (full replace).

### 2. Add the GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value | Notes |
| --- | --- | --- |
| `API_FOOTBALL_KEY` | (from data-pipeline/.env) | match data. **Rotate before real launch.** |
| `RAPIDAPI_KEY` | (from data-pipeline/.env) | scraped SofaScore. **Rotate before real launch.** |
| `CLOUDFLARE_API_TOKEN` | new token (see below) | deploy site + publish D1 |
| `CLOUDFLARE_ACCOUNT_ID` | `cfe39f4145ce89e2b746ed4e787c3b7a` | which CF account |

**Minting the Cloudflare API token:** dash.cloudflare.com → My Profile → API Tokens →
Create Token → Custom token, with permissions:
- **Account → Workers Scripts → Edit** (site deploy — the site is a Worker now, not Pages)
- **Account → D1 → Edit** (warehouse publish)

Scope it to your account. That one token covers both steps.

### 3. Enable the schedule

The workflow runs on `cron: '7 * * * *'` (hourly) and can be triggered manually from the
Actions tab (`workflow_dispatch`). GitHub disables scheduled workflows after 60 days of repo
inactivity — a manual run re-arms it.

## How the refresh stays cheap

- `REFRESH=1` forces only the **live fixtures list + standings + SofaScore match list**
  (a few calls per run).
- Per-fixture detail (stats/events/lineups/odds) is **cached by fixture id** in
  `data-pipeline/sources/` (cached across runs via `actions/cache`), so only **newly-finished**
  matches fetch their detail. Steady state ≈ a handful of calls/hour.

## Writer access to D1

Options (settle with the writer):
- **D1 REST API** with a scoped read token — the agent queries
  `POST /accounts/{acct}/d1/database/{id}/query` with `{ sql }`.
- **A tiny read-only Worker** that exposes named queries — simpler for the agent, hides the
  raw token.

The D1 schema mirrors the local warehouse. Key tables for writers: `af_fixture` (results/status),
`af_event` (goals/cards/subs with minute + assist), `af_team_stat` / `af_player_stat` (per-match
stats + ratings), `af_lineup` / `af_lineup_player` (actual XIs), `player` + `player_tier` +
`club_tier`, `h2h`, `intl_result` (all-time results), `ss_vote` (fan sentiment).
