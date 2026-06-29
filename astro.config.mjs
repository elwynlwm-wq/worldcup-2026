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
  // IMPORTANT: set this to the production domain before launch — sitemap,
  // canonical URLs and OG tags all derive from it. See docs/seo.md.
  // Currently the Cloudflare Pages preview URL; switch to the real domain
  // once it's attached.
  site: 'https://worldcup-2026-now.pages.dev',

  output: 'static',

  integrations: [
    preact({ compat: true }),
    mdx(),
    sitemap(),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  // Use Astro's built-in image optimization for in-repo images (docs/media-and-assets.md).
  image: {},
});
