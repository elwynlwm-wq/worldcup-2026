/// <reference types="astro/client" />

// Per-request values set by src/middleware.ts / Cloudflare adapter.
declare namespace App {
  interface Locals {
    /**
     * White/offer bucket from cloakit.house, sticky via `ab_stream`.
     * A = white (clean) · B = offer (Sportify extras).
     */
    streamVariant: 'A' | 'B';
    /**
     * Whether to render the Sportify stream promo.
     * True only when streamVariant === 'B' (cloakit filter_page === "offer").
     * Fail-closed: API errors / white / unknown → false.
     */
    showStreamPromo: boolean;
    /** Cloudflare ExecutionContext — waitUntil for fire-and-forget tracking. */
    cfContext?: {
      waitUntil: (promise: Promise<unknown>) => void;
      passThroughOnException: () => void;
    };
  }
}

// Cloudflare Worker secrets / bindings (wrangler secret / dashboard).
// SITE_TOKEN = tracker write token for source:server events (Bearer).
interface Env {
  DB: D1Database;
  SITE_TOKEN?: string;
}
