import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection, z } from "astro:content";

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  blog: defineCollection({
    schema: z.object({
      title: z.string(),
      description: z.string(),
      authors: z
        .array(
          z.object({
            name: z.string(),
            url: z.string().url().optional(),
            image_url: z.string().url().optional(),
          }),
        )
        .optional(),
      tags: z.array(z.string()).optional(),
    }),
  }),
};
