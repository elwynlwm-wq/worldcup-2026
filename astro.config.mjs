import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
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

  // Edge caching for SSR routes — this REPLACES the 30-min full-site rebuild.
  // Data pages render from D1 but are cached at Cloudflare's edge and revalidated
  // in the background (stale-while-revalidate), so readers get near-static speed
  // with fresh data. The pipeline invalidates by tag when new data lands (Phase 3).
  cache: { provider: cacheCloudflare() },
  // Every SSR route is edge-cached: served fresh for `maxAge`, then served stale
  // for up to `swr` more seconds while a background request revalidates. Tagged
  // so the pipeline can purge the right pages on publish (Phase 3). All data pages
  // share the 'fixtures' tag (anything touching results/status); pages that never
  // change on a data refresh could use longer windows, but 2m/10m is a safe
  // default that keeps content within a couple minutes of D1 with near-static speed.
  routeRules: {
    '/': { maxAge: 120, swr: 600, tags: ['fixtures'] },
    '/today': { maxAge: 120, swr: 600, tags: ['fixtures', 'today'] },
    '/matches': { maxAge: 120, swr: 600, tags: ['fixtures'] },
    '/matches/[...id]': { maxAge: 120, swr: 600, tags: ['fixtures'] },
    '/teams/[...id]': { maxAge: 300, swr: 900, tags: ['fixtures'] },
    '/bracket': { maxAge: 120, swr: 600, tags: ['fixtures'] },
    '/players': { maxAge: 600, swr: 1800, tags: ['fixtures'] },
    '/power': { maxAge: 600, swr: 1800, tags: ['fixtures'] },
    '/record': { maxAge: 300, swr: 900, tags: ['fixtures'] },
  },

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
