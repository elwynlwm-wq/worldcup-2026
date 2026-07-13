// /go/<slug> — affiliate hop: fire tracker conversion (server), then 302.
// Google-first: no Meta CAPI. Secrets via cloudflare:workers (SITE_TOKEN).
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getClientIp } from '../../lib/cloak';
import {
  GO_ROUTES,
  fbclidFromFbc,
  getCountry,
  looksLikeBot,
  readCookie,
  sendServerEvent,
  withClickIds,
} from '../../lib/tracker';

export const prerender = false;

type CfLocals = { cfContext?: { waitUntil: (p: Promise<unknown>) => void } };

function token(): string | undefined {
  return (env as { SITE_TOKEN?: string }).SITE_TOKEN;
}

export const GET: APIRoute = async ({ params, request, locals, url }) => {
  const slug = (params.slug || '').toLowerCase();
  const route = GO_ROUTES[slug];

  console.log(`[go] hit slug="${slug}" matched=${!!route}`);

  const redirect = (location: string) =>
    new Response(null, {
      status: 302,
      headers: { location, 'cache-control': 'no-store' },
    });

  if (!route) {
    console.warn(`[go] unknown slug="${slug}" -> /`);
    return redirect('/');
  }

  const waitUntil = (locals as CfLocals).cfContext?.waitUntil?.bind(
    (locals as CfLocals).cfContext,
  );

  if (route.track) {
    const fbc = readCookie(request, '_fbc');
    sendServerEvent(
      {
        type: 'conversion',
        path: '/go',
        affiliate: route.url,
        visitor: readCookie(request, '_vid'),
        variant: readCookie(request, 'ab_stream')?.toUpperCase(),
        country: getCountry(request),
        ip: getClientIp(request) || undefined,
        bot: looksLikeBot(request.headers.get('user-agent')),
        fbc: fbc || undefined,
        gclid: readCookie(request, '_gclid') || undefined,
        gbraid: readCookie(request, '_gbraid') || undefined,
        wbraid: readCookie(request, '_wbraid') || undefined,
      },
      token(),
      waitUntil,
    );
  }

  const fbclid =
    url.searchParams.get('fbclid') ||
    fbclidFromFbc(readCookie(request, '_fbc')) ||
    undefined;
  const gclid = url.searchParams.get('gclid') || readCookie(request, '_gclid') || undefined;
  const gbraid = url.searchParams.get('gbraid') || readCookie(request, '_gbraid') || undefined;
  const wbraid = url.searchParams.get('wbraid') || readCookie(request, '_wbraid') || undefined;

  const dest = withClickIds(route.url, { gclid, fbclid, gbraid, wbraid });
  console.log(
    `[go] redirect slug=${slug} gclid=${gclid ? 'yes' : 'no'} fbclid=${fbclid ? 'yes' : 'no'} -> ${dest}`,
  );

  return redirect(dest);
};
