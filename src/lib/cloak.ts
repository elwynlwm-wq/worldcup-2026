// ============================================================================
//  WHITE / OFFER routing — cloakit.house (same rules as ApexHub / phbethub)
// ============================================================================
//
// On first visit (no sticky cookie) we POST visitor signals to cloakit and map:
//
//     filter_page === "offer"  -> real user  -> bucket "B" (Sportify extras on)
//     filter_page === "white"  -> filtered   -> bucket "A" (clean white page)
//     anything else / failure  -> DEFAULT "A" (fail closed — show white)
//
// We IGNORE url_offer_page / url_white_page from the API — same site, additive UI
// only (showStreamPromo). filter_type is logged, never gates the decision
// (subscription_expired / flow_* still fail closed to A, not a hard exit).
// ============================================================================

export const CLOAK_ENDPOINT = 'https://cloakit.house/api/v1/check';
/** World Cup SG flow — cloakit.house dashboard label */
export const CLOAK_LABEL = 'd6313ea003e7e4072748493990bc05b9';

/** Never hang the page longer than this. Timeout → white (A). */
export const CLOAK_TIMEOUT_MS = 5000;

export type CloakBucket = 'A' | 'B';

export type CloakSignals = {
  ua: string;
  referer: string;
  query: string;
  lang: string;
  ip: string;
};

/**
 * Client IP on Cloudflare Workers: CF-Connecting-IP first, then x-real-ip,
 * then first x-forwarded-for hop. (ApexHub used Vercel helpers; same idea.)
 */
export function getClientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf?.trim()) return cf.trim();
  const real = request.headers.get('x-real-ip');
  if (real?.trim()) return real.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return '';
}

/**
 * Returns "B" only when cloakit explicitly says filter_page === "offer".
 * All other outcomes (white, missing, non-success HTTP, timeout, network,
 * malformed JSON) return "A".
 */
export async function assignBucket(signals: CloakSignals): Promise<CloakBucket> {
  const body = new URLSearchParams({
    label: CLOAK_LABEL,
    user_agent: signals.ua || '',
    referer: signals.referer || '',
    query: signals.query || '',
    lang: signals.lang || '',
    ip_address: signals.ip || '',
  });

  console.log(
    `[cloak] checking visitor: ip=${signals.ip || '-'} lang=${(signals.lang || '-').slice(0, 12)} ua=${(signals.ua || '-').slice(0, 80)}`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLOAK_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(CLOAK_ENDPOINT, {
      method: 'POST',
      body,
      signal: controller.signal,
    });
    const ms = Date.now() - start;

    // Mirror PHP reference + ApexHub: only these statuses are success.
    if (![200, 201, 204, 206].includes(res.status)) {
      console.warn(`[cloak] non-success HTTP ${res.status} (${ms}ms) -> defaulting to white (A)`);
      return 'A';
    }

    const data = (await res.json().catch(() => null)) as {
      filter_page?: string;
      filter_type?: string;
    } | null;

    console.log(`[cloak] response: ${JSON.stringify(data)} (${ms}ms)`);

    const verdict = data?.filter_page;
    const bucket: CloakBucket = verdict === 'offer' ? 'B' : 'A';
    console.log(
      `[cloak] filter_page=${verdict || 'none'} filter_type=${data?.filter_type || '-'} -> bucket=${bucket} (${ms}ms)`,
    );
    return bucket;
  } catch (e) {
    const ms = Date.now() - start;
    const err = e as { name?: string; message?: string };
    if (err?.name === 'AbortError') {
      console.warn(`[cloak] timeout after ${CLOAK_TIMEOUT_MS}ms -> defaulting to white (A)`);
    } else {
      console.warn(`[cloak] error: ${err?.message || e} (${ms}ms) -> defaulting to white (A)`);
    }
    return 'A';
  } finally {
    clearTimeout(timer);
  }
}
