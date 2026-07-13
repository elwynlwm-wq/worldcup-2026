import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Static by default, SSR where the data plane needs it. `output: 'static'` keeps
// every page prerendered unless it opts in with `export const prerender = false`,
// at which point it server-renders on Cloudflare Workers reading from D1
// (`import { env } from 'cloudflare:workers'` → env.DB). This lets evergreen
// pages (articles, About, Method) stay static while match/data pages go live.
// See docs/architecture.md and docs/stack.md.
export default defineConfig({
  // Production domain — sitemap, canonical URLs and OG tags all derive from it.
  // Apex on Cloudflare. See docs/seo.md.
  site: 'https://worldcupanalyzer.io',

  // Match the old Pages behavior: canonical URLs carry a trailing slash and
  // no-slash requests redirect to the slash form (rather than 404). Keeps
  // existing inbound links / indexed URLs working after the Workers cutover.
  trailingSlash: 'always',

  output: 'static',
  adapter: cloudflare({
    // Run full Node during prerender (image opt, sitemap) — only SSR routes hit workerd.
    imageService: 'compile',
    // Dedicated Workers config; the root wrangler.toml stays Pages-shaped so the
    // existing pipeline (publish:d1, pages deploy) keeps working until cutover.
    configPath: 'wrangler.worker.toml',
  }),

  // NOTE: edge caching for SSR routes is intentionally DISABLED while the A/B
  // stream promo runs. It previously used `cache: cacheCloudflare()` + per-route
  // `routeRules` (maxAge/swr), which made the adapter emit
  //   Cloudflare-CDN-Cache-Control: public, max-age=120, stale-while-revalidate=600
  // Cloudflare's edge obeys THAT header and does not key the cache on our A/B
  // cookie (Vary: Cookie is not honored for cache-key purposes), so it cached one
  // variant's HTML and served it to everyone — a visitor got pinned to whichever
  // variant first warmed the cache, and since the cached page carried no
  // Set-Cookie the worker never re-ran to reassign. That is the "always B / no
  // cookie on refresh" bug.
  //
  // With no cache provider / routeRules, the adapter falls back to
  // `Cloudflare-CDN-Cache-Control: no-store` (see @astrojs/cloudflare
  // utils/handler.js), so every SSR route runs the worker per request and the A/B
  // bucket is always honored. Tradeoff: data pages render per-request from D1
  // instead of being edge-cached ~2m. FOLLOW-UP to restore edge caching: fold the
  // A/B bucket into the cache KEY (Workers Cache API keyed on variant) instead of
  // relying on Vary, then re-enable routeRules. See docs/architecture.md.

  integrations: [
    preact({ compat: true }),
    mdx(),
    // Keep utility pages out of the sitemap — /search is a tool, not content.
    sitemap({
      filter: (page) => !/\/search\/?$/.test(page),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  // Use Astro's built-in image optimization for in-repo images (docs/media-and-assets.md).
  image: {},
});
