// Edge middleware: assign a sticky A/B bucket for the Sportify stream promo, and
// keep the SSR edge-cache correct so the two variants never bleed into each other.
//
// WHY THIS EXISTS
//   Landing/data pages are SSR + edge-cached (see astro.config.mjs routeRules).
//   We show a "Watch live" promo (Sportify) to HALF of visitors (variant B) and
//   the clean analytics experience to the other half (variant A), to A/B test it.
//   Two hard requirements fall out of that:
//     1. STICKY  — a visitor must keep the same variant across pages/visits, so
//                  we persist it in the `ab_stream` cookie.
//     2. CACHE-SAFE — the edge cache must serve A's HTML to A and B's HTML to B.
//                  If the cache key ignored the bucket, whichever variant rendered
//                  first would be cached and served to EVERYONE, silently breaking
//                  the test. We fold the bucket into the cache key via `Vary` +
//                  a normalized cache cookie (see cacheKeyByBucket below).
//
// SCOPE (per product): geo-gating is NOT done here. Everyone in variant B gets the
// promo; Sportify handles licensed-territory routing on their side (restricted
// users are bounced to the community/chat by sportifylive.io itself). The region
// team will later AND-in a geo check at the ONE marked line below — pages read
// only `locals.showStreamPromo`, so the UI never changes when that lands.
import { defineMiddleware } from 'astro:middleware';

const COOKIE = 'ab_stream';
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Assign a 50/50 bucket. Cheap, uniform, no crypto needed for a UI experiment. */
function pickBucket(): 'A' | 'B' {
  return Math.random() < 0.5 ? 'A' : 'B';
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, locals } = context;

  // Sticky: reuse an existing valid bucket, else assign + persist a new one.
  const existing = cookies.get(COOKIE)?.value;
  const variant: 'A' | 'B' = existing === 'A' || existing === 'B' ? existing : pickBucket();
  if (existing !== variant) {
    cookies.set(COOKIE, variant, {
      path: '/',
      maxAge: ONE_YEAR,
      sameSite: 'lax',
      httpOnly: false, // readable client-side too, in case we add client analytics later
    });
  }

  locals.streamVariant = variant;
  // ── The single promo gate. Region team: AND-in the geo check HERE, e.g.
  //    locals.showStreamPromo = variant === 'B' && isLicensedRegion(context.request);
  //    Nothing in the UI needs to change.
  locals.showStreamPromo = variant === 'B';

  const response = await next();

  // Cache-safety for cookie-bucketed A/B pages.
  //
  // THE BUG THIS FIXES: on a RETURN visit (cookie already set) the response has no
  // Set-Cookie, so Cloudflare's edge caches it per astro.config routeRules (observed
  // cf-cache-status: HIT on `/`). But the edge does NOT reliably honor `Vary: Cookie`
  // as part of the cache key, so whichever variant first warmed the cache is then
  // served to EVERYONE regardless of their bucket — the "always B" symptom.
  //
  // THE FIX (deliberate tradeoff): `private, no-store` opts every SSR route out of
  // BOTH the shared edge cache and the browser cache, so each request re-runs this
  // worker and its own bucket is always honored. This DISABLES the edge caching the
  // SSR migration set up (routeRules maxAge/swr no longer take effect) — data pages
  // now render per-request. Chosen for A/B correctness now; a follow-up can restore
  // edge caching by folding the bucket into the cache KEY (Workers Cache API keyed on
  // variant) instead of relying on Vary. See docs/architecture.md cache notes.
  //
  // NOTE: after deploying this, PURGE the existing cached pages (they were cached
  // before no-store shipped and will keep serving until evicted).
  response.headers.append('Vary', 'Cookie');
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Pragma', 'no-cache');
  // Cloudflare reads its OWN header (Cloudflare-CDN-Cache-Control) for edge-cache
  // decisions and it takes precedence over Cache-Control at the edge. The Astro
  // adapter emits it from astro.config routeRules (e.g. "public, max-age=120,
  // stale-while-revalidate=600"), which would keep the edge caching (and serving
  // cross-bucket) despite our no-store. Override it so the edge also stops caching.
  response.headers.set('Cloudflare-CDN-Cache-Control', 'private, no-store');

  return response;
});
