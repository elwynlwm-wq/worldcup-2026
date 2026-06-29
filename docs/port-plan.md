# Kickabout design port — plan

*Drafted 29 June 2026. Porting the final design (`concepts/world-cup-platform-navigation/`,
primary file `project/Kickabout.dc.html`) into our Astro app. Per the handoff README: recreate
pixel-perfectly in our tech, don't copy the prototype's SPA structure.*

## Design system (extracted from the source)

**IMPORTANT — the final design is a LIGHT, warm-cream theme** (our Phase B dark reskin is superseded).

Palette:
- Background `#e7e2d4` (warm cream); surfaces `#fff`, `#faf6ee`, `#f1ebdf`
- Text `#16181d` (near-black); muted `#6f6655`, `#a59a85`, `#b3a890`; borders `#e4dccd`, `#e9e1d2`
- **Accents: gold `#f3b50a`** (highlights, "read the story", selection) + **royal blue `#1f3fbf`** (links, labels, logo "about")
- Story/editorial accents: green `#138a5e`, red `#9d2730`; dark hero panels `#16181d`

Type:
- **Archivo** 800/900 — display/headings (tight letter-spacing, `text-wrap:balance`)
- **Hanken Grotesk** — body/UI
- **Newsreader** (serif, italic option) — story deks / editorial voice

Motifs:
- Rounded cards (14–20px radius), subtle shadow, hover-lift (`translateY(-3px)`)
- **Two-tone diagonal team marks** (`grad`) in dense contexts; **flag SVGs** (in assets/flags/, all 48)
  for 1–2-team contexts — exactly our earlier decision.
- `assets/pitch.svg` motif, hero images with dark gradient overlays
- Entry animations (rise/pop/grow)

## Pages in the design (14 sections)

Home (Stories + Today tabs) · Stories hub · Story detail · Matches · Predictor · Match detail ·
Teams · Team detail · Power ranking · Bracket/Groups · Players · Player detail · Search.

Nav: **Today / Matches / Stories / Teams / Bracket** + search.

## Information architecture (from tech lead, 29 Jun)

Two parts; the blog **feeds into** the platform (not separate silos).

**1) Blog (content)** — categorized by **team(s) involved + type (pre-match / post-match)**.
Surfaces *inside* the platform: team page (related news), H2H page (pre/post-match reads).
So an article is tagged by teams + pre/post, and auto-appears on the matching team & H2H pages.

**2) Platform (analysis):**
- **Listings:** Matches, Bracket
- **H2H "A vs B" pages — TWO TYPES (key):**
  | Type | State | Content |
  |---|---|---|
  | **Upcoming** (Live treated as upcoming for now) | not played | predicted XI + who-will-win votes (SofaScore), our forecast, all-time H2H, **pre-match articles** |
  | **Played** | 100% over | final score, real lineups, **xG/stats/events/ratings** (API-Football), **post-match articles** |
  Branch on fixture status (`FT` = Played; `NS`/scheduled/live = Upcoming). One shell, two bodies.
  Live ticker is a later phase.
- **Team pages** — their matches + stats (+ related news from blog)
- **Player pages**

This refines the design's single "Match detail" into **two state-driven match templates**.

## Mapping to our current site + data

| Design page | Our route | Data (we HAVE it) |
|---|---|---|
| Home (Today/Stories) | `/` | fixtures, votes (Showdown), featured story, contenders |
| Matches | `/matches` (new) | af-fixtures (fresh), votes |
| H2H evergreen (UPCOMING) | `/h2h/<a>-vs-<b>` | predicted XI + votes, forecast, all-time H2H, pre-match articles. Always-current, refreshes, permanent (good SEO equity). |
| Match record (PLAYED) | `/matches/<a>-vs-<b>-<round>` | final score, real lineups, xG/stats/events/ratings, post-match articles. Archival, frozen after match. |
| Predictor | `/analysis/predict` | model + H2H + Showdown (have) |
| Teams | `/analysis/teams` (or `/teams`) | teams + two-tone marks |
| Team detail | `/analysis/teams/[id]` | squad, tiers, photos, banner, standing |
| Power ranking | `/analysis/power` | power ranking (have) |
| Bracket/Groups | `/analysis/bracket` | af-fixtures knockout + standings |
| Stories hub/detail | `/articles`, `/articles/[id]` | MDX content |
| Players / Player detail | `/players`, `/players/[id]` (new) | players + tiers + photos + match stats |
| Search | (later) | teams/players index |

New data now available to wire: **predicted XI + who-will-win votes (SofaScore), xG/team stats,
events, standings, player match ratings, player photos, generated banners.**

## Port order (proposed)

1. **Design system foundation** — replace global.css tokens with the cream/gold/blue palette +
   3 fonts; rebuild Base + Analysis layouts to the new header/nav/footer. Everything sits on this.
2. **Two-tone team mark + flag components** — shared, used everywhere (build the colors dataset).
3. **Home** (Today + Stories tabs) — proves the system, wires Showdown + fixtures + featured story.
4. **Team detail** — richest data page (squad/tiers/photos/banner/standing).
5. **Match detail** (new) — the big new page: stats/xG/events/lineups/votes/H2H.
6. **Teams, Power, Bracket/Groups** — restyle existing.
7. **Stories** (articles) restyle with Newsreader editorial.
8. **Players + Player detail** (new), Search — last.

## Routing decisions (29 Jun)

- **H2H = evergreen + per-match (two URLs, two purposes):**
  - `/h2h/<a>-vs-<b>` — evergreen, UPCOMING-flavoured (predicted XI, votes, forecast, all-time
    record, pre-match reads). Refreshes; permanent → accrues SEO equity.
  - `/matches/<a>-vs-<b>-<round>` — PLAYED, archival record (score, real lineups, stats/xG/events,
    post-match reads). Frozen after the match.
  - The fixture's status decides which is the "live" destination; both can exist.

## Blog tagging: loose tags, disciplined vocabulary (29 Jun)

No rigid schema — keep the flexible `tags: []`. Power comes from **non-overlapping tag
namespaces** that compose into URL queries:
- team slugs (canonical, e.g. `brazil` — same slugs as the warehouse), round names
  (`round-of-32`), type (`pre-match`, `post-match`, `feature`).
- Team page = articles tagged `<team>`; H2H = tagged `<a>` AND `<b>`; pre-match filter adds
  `pre-match`. As long as vocabularies don't collide, combine freely.
- Keep a documented **tag vocabulary** (team slugs, rounds, types) so authors/AI tag consistently
  — loose values, disciplined vocabulary.

## Notes
- Discard the prototype's hash-router/SPA + `<sc-for>`/`<sc-if>` templating; recreate with Astro
  components + our provider/warehouse data.
- Light theme means re-tuning article `prose` (we'd done dark) back to light editorial.
- Keep static-first + real URLs + provider seam (unchanged architecture).
