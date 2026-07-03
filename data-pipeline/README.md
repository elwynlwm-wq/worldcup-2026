# data-pipeline

Pure data engineering for the World Cup 2026 warehouse. Fetches free sources, links them into a
SQLite warehouse, derives signals (head-to-head + strength tiers), and exports JSON the site reads.

**This is not the runtime backend and not the AI agent** — it's the offline pipeline that produces
the data. See `V1-PLAN.md` for scope and `REQUIREMENTS.md`/`SOURCING.md` for the why.

## Run it

```
npm install
npm run all          # fetch → build:warehouse → export
# or individually:
npm run fetch            # warm source caches (sources/)
npm run build:warehouse  # build warehouse/warehouse.db from sources
npm run export           # write warehouse/export/*.json for the app
```

No API keys needed — all v1 sources are free/keyless.

## Reel ingest (`npm run reel`)

A **manual, local** task — deliberately not in CI (it needs a logged-in Instagram
session, which must not live on a shared runner). Given one Instagram post URL it:
downloads the reel → extracts a poster frame → uploads the video to R2 → prints a
ready-to-paste `<VideoReelCard>` for the postmatch article. Video lives on R2;
only the small poster JPG lands in `public/reels/` (in-repo, for LCP).

```
npm run reel -- --slug france-sweden --url https://www.instagram.com/p/XXXX/
npm run reel -- --slug england-dr-congo --url <URL> --poster-at 3   # frame at 3s
```

`--slug` is the article's reel slug, `home-away` (e.g. `france-sweden`).

One-time setup on the machine that runs it:

- Install **`yt-dlp`**, **`ffmpeg`**, and the **`aws`** CLI (used for the R2 S3 upload).
- Copy `.env.example` → `.env` and fill in:
  - `IG_COOKIES` — path to a **Netscape-format** `cookies.txt` for the (burner) IG
    account. (Shared privately, e.g. via Doppler — never commit it.)
  - `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_KEY`,
    `CLOUDFLARE_R2_ACCESS_POINT` — the R2 **S3 access-key pair + endpoint** (Cloudflare
    dashboard → R2 → Manage API Tokens). Not a Bearer API token — R2 upload is S3.

Then paste the printed `<VideoReelCard>` line into the article (add the
`VideoReelCard` import if it isn't there yet). The writer owns the prose; the
script only produces the media + the card snippet.

## Sources (v1, all free)

- **snapshot** — `../src/data/raw.ts`: verified 48 squads + Elo/FIFA ratings (roster base)
- **openfootball/worldcup.json** — WC2026 fixtures/structure (CC0)
- **clubelo.com** — club Elo ratings → club tiers
- **martj42/international_results** — all-time intl results (~49k) → all-time H2H

## What's in git vs not

- **In git:** the code (`fetch/`, `build/`, `lib/`), `schema.sql`, and `warehouse/export/*.json`
  (text, diffs cleanly — the site's rendering cache).
- **NOT in git:** `warehouse/*.db` (binary, rebuildable — mirror to R2 when shared) and `sources/`
  (refetchable raw pulls). See `.gitignore` and `V1-PLAN.md`.

The DB is a **rebuildable artifact**: anyone can regenerate it with `npm run all`.

## Layout

```
fetch/      one fetcher per source (+ index.ts to warm caches)
build/      index.ts (link → SQLite), derive.ts (H2H + tiers), reconcile.ts (name matching), export.ts, reel.ts (reel ingest)
lib/        shared utils (slug, cached fetch, CSV)
schema.sql  the linkable schema
sources/    raw fetched data (gitignored)
warehouse/  warehouse.db (gitignored) + export/*.json (committed)
```

## Known v1 limitations

- **Club name matching:** ~177/470 clubs match clubelo directly; the rest use a league-strength
  fallback (so non-European clubs degrade gracefully, not to "unknown"). Aliases live in
  `build/reconcile.ts` — extend as needed.
- **Player tiers** lean on career caps/intl goals + club tier; they reflect career standing more
  than current form (e.g. a veteran with many goals outranks a rising star with few caps). Coarse
  by design; tunable in `build/derive.ts`.
- **All-time H2H** maps current WC nations; predecessor states (USSR, Yugoslavia, etc.) are not
  merged into successors — a noted limitation, fine for a fan site.

## How the app consumes it

The exported JSON is read by the Astro site through the provider seam (`src/lib/provider.ts`),
so swapping to a live backend later (Neon, in v2) doesn't change the pages. See `docs/architecture.md`.
