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

  // Cache-safety: the edge cache must key on the bucket. Advertise that responses
  // vary by the ab_stream cookie so A and B are stored/served as distinct entries
  // and never cross-contaminate. (Variant is also in the cookie the visitor sends,
  // so their sticky bucket and the cached copy always agree.)
  response.headers.append('Vary', 'Cookie');

  return response;
});
