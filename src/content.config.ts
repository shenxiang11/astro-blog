import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import config from "@/config";
import { DEMO_PREVIEWS } from "./data/demoPreviews";

export const BLOG_PATH = "src/content/posts";
export const DEMOS_PATH = "src/content/demos";

const posts = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: `./${BLOG_PATH}` }),
  schema: ({ image }) =>
    z.object({
      author: z.string().default(config.site.author),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      title: z.string(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      tags: z.array(z.string()).default(["others"]),
      ogImage: image().or(z.string()).optional(),
      description: z.string(),
      canonicalURL: z.string().optional(),
      hideEditPost: z.boolean().optional(),
      timezone: z.string().optional(),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    canonicalURL: z.string().optional(),
  }),
});

const demos = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: `./${DEMOS_PATH}` }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      subtitle: z.string(),
      pubDatetime: z.date(),
      cover: image().or(z.string()).optional(),
      video: z.string().optional(),
      preview: z.enum(DEMO_PREVIEWS).optional(),
      order: z.number().optional(),
      draft: z.boolean().optional(),
    }),
});

export const collections = { posts, pages, demos };
