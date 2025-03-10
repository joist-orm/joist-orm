import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

const blogSchema = z.object({
  title: z.string(),
  description: z.string(),
  slug: z.string().optional(),
  pubDate: z.date().optional().transform((str) => new Date(str)),
  authors: z.array(z.object({
    name: z.string(),
    url: z.string().url().optional(),
    image_url: z.string().url().optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
});

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	blog: defineCollection({ schema: blogSchema }),
};
