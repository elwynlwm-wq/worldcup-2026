import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Static-first by design: the content plane is pre-rendered to HTML for best SEO.
// When the data plane needs SSR / on-demand rendering, add the Cloudflare adapter
// (@astrojs/cloudflare) and mark only those routes as server-rendered.
// See docs/architecture.md and docs/stack.md.
export default defineConfig({
  // Production domain — sitemap, canonical URLs and OG tags all derive from it.
  // Apex on Cloudflare (DNS moved to CF so the apex CNAME-flattens to Pages).
  // See docs/seo.md.
  site: 'https://worldcupanalyzer.io',

  output: 'static',

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
