# Google Ads — Single Video Campaign (launch)

**Market:** Singapore  
**Site:** https://worldcupanalyzer.io  
**Asset:** one vertical video (~8s) — Les Bleus vs La Roja / who wins  
**Goal:** traffic → insight site; offer extras only for cloak **B**  
**Tracking:** pageview + alive + `/go/sportify` conversion (see `docs/TRACKING.md`)

---

## 1. What you’re building

| Item | Value |
|------|--------|
| Campaigns | **1** |
| Type | **Demand Gen** |
| Ad groups | **1** |
| Ads / assets | **1 video** (9:16) |
| Geo | Singapore |
| Language | English |
| Final URL | `https://worldcupanalyzer.io/` *(or `/today/` if that’s stronger)* |
| Networks | Demand Gen defaults (YouTube + Discover + Gmail) — **Shorts included** when vertical |

**Not v1:** Search, Display GDN, Performance Max, multi-RSA tests.

---

## 2. Before you click Create

- [ ] Video uploaded to **YouTube** (unlisted is fine) — same account / channel linked to Ads  
- [ ] **9:16**, ~**8s**, ends on type (not mid-dive)  
- [ ] Auto-tagging **on** (account settings) → `gclid` on landings  
- [ ] Site live: cloak + tracking (`SITE_TOKEN` on Worker)  
- [ ] Test: land with `?gclid=test123` → cookie `_gclid` · `/go/sportify` 302s  
- [ ] Conversion (optional v1): if you import site events later, primary can stay **clicks / landing** until volume  

---

## 3. Campaign setup (UI path)

1. **Google Ads → + New campaign**  
2. Objective: **Website traffic** (or “Create without a goal’s guidance” if you prefer full control)  
3. Campaign type: **Demand Gen**  
4. Conversion goals: leave default or none for pure traffic learning  
5. Campaign name: `SG | DG | WC semi video | v1`  
6. **Locations:** Singapore only · **exclude** interest location if shown · Location options: Presence  
7. **Languages:** English  
8. **Budget:** fixed daily you’re willing to learn on (e.g. small constant)  
9. **Bidding:** Maximize clicks · optional max CPC cap once you see CPCs  
10. **Ad group name:** `Insights · football watchers`  

### Audience (keep simple)

| Setting | v1 |
|---------|-----|
| Demo | Men optional; age **21+** if available and you want it |
| Interests / segments | Football, Soccer, Sports — **if** listed; else **broad SG** |
| Custom segments | Optional later: “world cup predictions”, “match preview” searchers |
| Exclusions | None day one |

Do **not** stack casino/gambling interests for Google v1 (policy + wrong surface). Betting-open is creative psych + on-site B, not ad-interest spam.

---

## 4. The single ad (video)

### Creative (locked direction)

| Element | Content |
|---------|---------|
| Video | 8s 9:16 — stadium → **LES BLEUS vs LA ROJA** → strike → keeper dive → net → **WHO WAS THAT?** → **WHO WINS TONIGHT?** |
| Not in video | “The read before kickoff” (use in text) |
| No | Flags as graphics, real star faces, crests, odds, “bet”, stream logos |

### Ad text fields

**Headlines** (use all that fit; Demand Gen may take several):

1. Who wins tonight?  
2. Les Bleus vs La Roja  
3. The read before kickoff  
4. Free World Cup analysis  
5. Model · form · matchup  

**Descriptions:**

1. Free pre-kickoff analysis for people who actually watch the games.  
2. Clear match reads — form, squad context, transparent model. No fluff.  

**CTA button:** Learn more  

**Final URL:** `https://worldcupanalyzer.io/`  

**Display path (if shown):** `worldcupanalyzer.io` / `analysis`  

### Long headline / business name (if asked)

- Business: World Cup Analytics  
- Long headline: Who wins tonight? Free match analysis before kickoff  

---

## 5. Placements reality

Demand Gen will serve:

| Surface | Notes |
|---------|--------|
| **YouTube** (in-feed, in-stream where eligible) | Main volume for football |
| **YouTube Shorts** | 9:16 helps; swipe-fast → 8s is correct |
| **Discover** | Thumbnail/title matter |
| **Gmail** | Smaller; fine if mixed |

You usually **cannot** force “Shorts only” in a pure Demand Gen v1 — vertical asset biases mobile/Shorts-friendly inventory. That’s enough.

---

## 6. Second match night (optional same campaign)

When the **other semi** is live:

| Option | How |
|--------|-----|
| **A — Swap asset** | Pause ad 1 · new ad same ad group with other matchup video |
| **B — Two ads** | Both in same ad group; schedule or pause by day |

Same campaign, same budget. Don’t open a second campaign for one extra video.

---

## 7. Landing + cloak (what users see)

```
Ad → worldcupanalyzer.io
  → middleware: cloakit
       A (white)  = clean analytics, no Sportify chips
       B (offer)  = chips → /go/sportify → conversion + Sportify
  → alive beacon on all real browsers
```

**Ad promise must match A:** insights / who wins / analysis — not “free stream” or betting.

---

## 8. Success checks (first 48–72h)

| Signal | Good | Action if bad |
|--------|------|----------------|
| Impressions | Serving in SG | Policy / budget / geo |
| CTR / thumbstop | Hook works | New first frame or title |
| Landing sessions | Clicks reach site | Final URL / mobile speed |
| Bounce | People read | Hero = analysis, not empty state |
| `alive` ≈ pageviews (humans) | Tracking OK | Check CORS / beacon |
| `/go/sportify` (B only) | Offer path works | Chip visibility / cloak B rate |

**Ignore raw view counts.** Optimize for **qualified site sessions**, then promo clicks.

---

## 9. Do not

- Five videos day one  
- Search campaign “just in case” in the same budget pot  
- “Watch free live” copy  
- Casino interests  
- Landing only on Sportify (breaks white/review story)  
- Optimize to views-only bidding for this funnel  

---

## 10. Checklist (copy into Ads notes)

```
[ ] Demand Gen · SG · English
[ ] 1 ad group · 1 video ad
[ ] Final URL: worldcupanalyzer.io/
[ ] Headlines: Who wins tonight? / Les Bleus vs La Roja / The read before kickoff
[ ] CTA: Learn more
[ ] Auto-tagging on
[ ] SITE_TOKEN set · pageview + alive verified
[ ] /go/sportify smoke-tested
[ ] Daily budget set · Maximize clicks
[ ] Name: SG | DG | WC semi video | v1
```

---

## 11. Related docs

- `docs/GOOGLE_ADS_LAUNCH_v1.md` — strategy background (Search probe optional)  
- `docs/TRACKING.md` — pageview / alive / conversion  
- Cloak: `src/lib/cloak.ts` + `src/middleware.ts`  
