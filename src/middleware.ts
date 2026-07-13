// Edge middleware:
//  1. cloakit.house white/offer → sticky ab_stream (A/B)
//  2. _vid + click-id cookies (gclid / fbclid / gbraid / wbraid)
//  3. server pageview to data-at.worldcupanalyzer.io
//  4. private no-store so A/B HTML never cross-caches
import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { assignBucket, getClientIp, type CloakBucket } from './lib/cloak';
import {
  COOKIE_MAX_AGE,
  VID_MAX_AGE,
  getCountry,
  looksLikeBot,
  mintVid,
  sendServerEvent,
} from './lib/tracker';

const AB_COOKIE = 'ab_stream';
const AB_MAX_AGE = 60 * 60 * 24 * 365;

type CfLocals = { cfContext?: { waitUntil: (p: Promise<unknown>) => void } };

function siteToken(): string | undefined {
  return (env as { SITE_TOKEN?: string }).SITE_TOKEN;
}

/** Page-ish path: no file extension on last segment (skip assets). */
function isPageRequest(pathname: string): boolean {
  const last = pathname.split('/').pop() || '';
  return !last.includes('.');
}

function cookieOpts(maxAge: number, secure: boolean) {
  return {
    path: '/' as const,
    maxAge,
    sameSite: 'lax' as const,
    httpOnly: false,
    secure,
  };
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, locals, request, url } = context;
  const secure = url.protocol === 'https:';
  const now = Date.now();

  // ── 1. Cloak bucket (sticky) ──────────────────────────────────────────
  const existing = cookies.get(AB_COOKIE)?.value;
  let variant: CloakBucket;
  let abReason: string;

  if (existing === 'A' || existing === 'B') {
    variant = existing;
    abReason = 'existing-cookie';
  } else {
    const ua = request.headers.get('user-agent') || '';
    const referer = request.headers.get('referer') || '';
    const lang = request.headers.get('accept-language') || '';
    const query = url.searchParams.toString();
    const ip = getClientIp(request);

    variant = await assignBucket({ ua, referer, query, lang, ip });
    abReason = `cloak=${variant}`;
    cookies.set(AB_COOKIE, variant, cookieOpts(AB_MAX_AGE, secure));
  }

  locals.streamVariant = variant;
  locals.showStreamPromo = variant === 'B';

  // ── 2. Visitor + click-id cookies ─────────────────────────────────────
  let vid = cookies.get('_vid')?.value;
  if (!vid) {
    vid = mintVid(now);
    cookies.set('_vid', vid, cookieOpts(VID_MAX_AGE, secure));
  }

  // Google Ads / YT / Demand Gen auto-tagging
  const gclid = url.searchParams.get('gclid');
  if (gclid && !cookies.get('_gclid')?.value) {
    cookies.set('_gclid', gclid, cookieOpts(COOKIE_MAX_AGE, secure));
  }
  const gbraid = url.searchParams.get('gbraid');
  if (gbraid && !cookies.get('_gbraid')?.value) {
    cookies.set('_gbraid', gbraid, cookieOpts(COOKIE_MAX_AGE, secure));
  }
  const wbraid = url.searchParams.get('wbraid');
  if (wbraid && !cookies.get('_wbraid')?.value) {
    cookies.set('_wbraid', wbraid, cookieOpts(COOKIE_MAX_AGE, secure));
  }

  // Meta (if ever mixed in) — store as _fbc for conversion payload
  const fbclid = url.searchParams.get('fbclid');
  if (fbclid && !cookies.get('_fbc')?.value) {
    cookies.set('_fbc', `fb.1.${now}.${fbclid}`, cookieOpts(COOKIE_MAX_AGE, secure));
  }

  console.log(
    `[mw] path=${url.pathname} ab=${variant} (${abReason}) promo=${locals.showStreamPromo} gclid=${!!(gclid || cookies.get('_gclid')?.value)}`,
  );

  // ── 3. Server pageview (real pages only) ──────────────────────────────
  if (isPageRequest(url.pathname)) {
    const waitUntil = (locals as CfLocals).cfContext?.waitUntil?.bind(
      (locals as CfLocals).cfContext,
    );
    sendServerEvent(
      {
        type: 'pageview',
        path: url.pathname,
        variant,
        visitor: vid,
        country: getCountry(request),
        ip: getClientIp(request) || undefined,
        bot: looksLikeBot(request.headers.get('user-agent')),
        fbc: cookies.get('_fbc')?.value,
        gclid: cookies.get('_gclid')?.value || gclid || undefined,
        gbraid: cookies.get('_gbraid')?.value || gbraid || undefined,
        wbraid: cookies.get('_wbraid')?.value || wbraid || undefined,
      },
      siteToken(),
      waitUntil,
    );
  }

  const response = await next();

  // ── 4. Cache isolation for A/B ────────────────────────────────────────
  response.headers.append('Vary', 'Cookie');
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Cloudflare-CDN-Cache-Control', 'private, no-store');

  return response;
});
