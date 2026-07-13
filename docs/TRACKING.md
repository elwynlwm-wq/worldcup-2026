# Tracking — pageview · alive · conversion

Same pattern as ApexHub (phbethub). Tracker: `https://data-at.worldcupanalyzer.io/e`.

| Event | Side | When |
|-------|------|------|
| `pageview` | server (middleware) | Real page load |
| `alive` | client (BaseLayout beacon) | JS ran — proof of human |
| `conversion` | server (`/go/<slug>`) | Affiliate hop before 302 |

## Secrets

| Name | Where | Role |
|------|--------|------|
| **`SITE_TOKEN`** | Cloudflare Worker secret / `.dev.vars` | `Authorization: Bearer` for `source:server` |

Never expose `SITE_TOKEN` to the browser. Client `alive` uses no token.

## Cookies

| Cookie | Purpose |
|--------|---------|
| `ab_stream` | Cloak bucket A/B |
| `_vid` | Shared visitor id (pageview ↔ alive ↔ conversion) |
| `_gclid` / `_gbraid` / `_wbraid` | Google Ads click ids (YT / Demand Gen auto-tag) |
| `_fbc` | Meta click id if ever present (`fb.1.<ts>.<fbclid>`) |

## /go routes

| Slug | Destination |
|------|-------------|
| `/go/sportify` | `https://sportifylive.io/` |
| `/go/sportify-chat` | `https://sportifylive.io/chat` |

Forwards gclid/fbclid/gbraid/wbraid onto the destination when present.

## YouTube / Demand Gen and gclid

With **auto-tagging** on in Google Ads, YT and Demand Gen **do** append `gclid` (and sometimes `gbraid`/`wbraid` on iOS). Middleware persists them on first landing.

## Local

```bash
# .dev.vars (not committed)
SITE_TOKEN=your_token_here
```

## Files

- `src/lib/tracker.ts` — endpoint, routes, sendServerEvent
- `src/middleware.ts` — cloak + cookies + pageview
- `src/pages/go/[slug].ts` — conversion + 302
- `src/layouts/BaseLayout.astro` — alive beacon
