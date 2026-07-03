import { defineCollection } from 'astro:content';
import { z } from 'astro:schema';
import { glob } from 'astro/loaders';

// The "articles" collection: blog posts, match previews/reviews, analysis.
// Authored as MDX in src/content/articles/. See docs/content-authoring.md.
//
// The schema is intentionally strict: SEO fields are required, so a post that
// is missing its title/description FAILS THE BUILD rather than shipping
// under-optimized. See docs/seo.md.
const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: ({ image }) =>
    z.object({
      // --- SEO essentials (required) ---
      title: z.string().max(70, 'Keep titles under ~70 chars for search results'),
      description: z
        .string()
        .min(50, 'Descriptions under 50 chars are too thin for SEO')
        .max(160, 'Meta descriptions over ~160 chars get truncated'),

      // --- Publishing ---
      publishDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      author: z.string().default('World Cup Analytics desk'),
      draft: z.boolean().default(false),

      // --- Taxonomy & presentation ---
      tags: z.array(z.string()).default([]),
      // Which layout/look to render with. Add values as we build more layouts.
      // NB: not named `layout` — MDX reserves that frontmatter key and tries to
      // resolve its value as a module import.
      pageStyle: z.enum(['standard', 'feature']).default('standard'),

      // --- Social / OG ---
      // In-repo image (path A in docs/media-and-assets.md). Optional: if omitted
      // we fall back to a default OG image. Use image() so the build optimizes it.
      ogImage: image().optional(),
      // Hero image shown on the article itself.
      heroImage: image().optional(),
      heroImageAlt: z.string().optional(),
    }),
});

export const collections = { articles };
