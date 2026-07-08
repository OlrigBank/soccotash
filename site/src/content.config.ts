import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const localGuide = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/local-guide' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    legacyId: z.string().optional(),
    category: z.string().optional().default('local'),
    categoryLabel: z.string().optional(),
    image: z.string().optional(),
    externalLink: z.string().optional(),
    recommended: z.boolean().optional().default(false),
    summary: z.string().optional(),
    legacyText: z.string().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    slug: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    heroTitle: z.string().optional(),
    heroText: z.string().optional(),
  }),
});

const listings = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/listings' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    summary: z.string().optional(),
    image: z.string().optional(),
    sleeps: z.string().optional(),
    bedrooms: z.string().optional(),
    bathrooms: z.string().optional(),
    featured: z.boolean().optional().default(false),
  }),
});

export const collections = {
  localGuide,
  pages,
  listings,
};
