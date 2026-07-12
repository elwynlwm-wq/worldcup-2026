/// <reference types="astro/client" />

// Per-request values set by src/middleware.ts and read by pages/components.
declare namespace App {
  interface Locals {
    /** A/B bucket for the stream promo, sticky per visitor via the `ab_stream` cookie. */
    streamVariant: 'A' | 'B';
    /**
     * Whether to render the Sportify stream promo. Today this is simply
     * `streamVariant === 'B'`. The region/geo team will later AND-in their
     * licensed-territory check here (in middleware.ts) — pages/components read
     * only this flag, so the UI never changes when that lands.
     */
    showStreamPromo: boolean;
  }
}
