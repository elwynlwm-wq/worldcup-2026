// Shared analytics tracker (pageview / alive / conversion).
// Mirrors ApexHub phbethub TRACKER_INTEGRATION + middleware/go patterns.
//
// Endpoint + token name are fixed for this site so client beacons can't drift.
// Server events: Authorization Bearer SITE_TOKEN (Cloudflare secret).
// Client events: no token (CORS allowlist on tracker).

export const TRACKER_ENDPOINT = 'https://data-at.worldcupanalyzer.io/e';

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90d click-attribution window
export const VID_MAX_AGE = 60 * 60 * 24 * 180;

export const BOT_UA_RE =
  /bot|crawl|spider|slurp|bing|googlebot|facebookexternalhit|headless|phantom|puppeteer|playwright|curl|wget|python-requests|axios/i;

export function looksLikeBot(ua: string | null | undefined): boolean {
  return !ua || BOT_UA_RE.test(ua);
}

/** Cloudflare country: request.cf.country or cf-ipcountry header. */
export function getCountry(request: Request): string | undefined {
  const cf = (request as Request & { cf?: { country?: string } }).cf;
  if (cf?.country && cf.country !== 'XX') return cf.country;
  const h = request.headers.get('cf-ipcountry');
  if (h && h !== 'XX') return h;
  return undefined;
}

export function readCookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get('cookie');
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function mintVid(now = Date.now()): string {
  return `${now.toString(36)}${Math.floor(Math.random() * 1e10).toString(36)}`;
}

export type ServerEvent = {
  type: 'pageview' | 'conversion';
  path: string;
  variant?: string;
  visitor?: string;
  affiliate?: string;
  country?: string;
  ip?: string;
  bot?: boolean;
  /** Meta click cookie fb.1.<ts>.<fbclid> if present */
  fbc?: string;
  /** Raw Google click id */
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
};

/**
 * Fire-and-forget server event. Never throws to caller — tracking must not
 * break the page. Pass waitUntil from locals.cfContext when available.
 */
export function sendServerEvent(
  body: ServerEvent,
  token: string | undefined,
  waitUntil?: (p: Promise<unknown>) => void,
): void {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  console.log(
    `[tracker] ${body.type} -> auth=${token ? 'yes' : 'MISSING'} path=${body.path} variant=${body.variant || '-'} country=${body.country || '-'} bot=${body.bot ?? '-'}`,
  );

  const p = fetch(TRACKER_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, source: 'server' }),
  })
    .then(async (r) => {
      const text = await r.text().catch(() => '');
      if (r.ok) console.log(`[tracker] ${body.type} OK ${r.status}: ${text}`);
      else console.error(`[tracker] ${body.type} FAILED ${r.status}: ${text}`);
    })
    .catch((e) => {
      console.error(`[tracker] ${body.type} error: ${e?.message || e}`);
    });

  if (waitUntil) waitUntil(p);
}

/** Affiliate routes for /go/<slug> — conversion + 302. */
export const GO_ROUTES: Record<string, { url: string; track: boolean }> = {
  sportify: { url: 'https://sportifylive.io/', track: true },
  'sportify-chat': { url: 'https://sportifylive.io/chat', track: true },
};

export function withClickIds(
  destUrl: string,
  ids: { gclid?: string; fbclid?: string; gbraid?: string; wbraid?: string },
): string {
  try {
    const u = new URL(destUrl);
    if (ids.gclid && !u.searchParams.has('gclid')) u.searchParams.set('gclid', ids.gclid);
    if (ids.fbclid && !u.searchParams.has('fbclid')) u.searchParams.set('fbclid', ids.fbclid);
    if (ids.gbraid && !u.searchParams.has('gbraid')) u.searchParams.set('gbraid', ids.gbraid);
    if (ids.wbraid && !u.searchParams.has('wbraid')) u.searchParams.set('wbraid', ids.wbraid);
    return u.toString();
  } catch {
    return destUrl;
  }
}

/** _fbc form fb.1.<ts>.<fbclid> → raw fbclid */
export function fbclidFromFbc(fbc: string | undefined): string | undefined {
  if (!fbc) return undefined;
  const m = fbc.match(/^fb\.\d+\.\d+\.(.+)$/);
  return m ? m[1] : undefined;
}
