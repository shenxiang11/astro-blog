import type { APIRoute } from "astro";
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { getPostsForLocale } from "@/utils/getLocalizedPosts";
import { getPostUrl } from "@/utils/getPostPaths";
import { resolveLocale, useTranslations } from "@/i18n";
import config from "@/config";

export const GET: APIRoute = async ({ currentLocale }) => {
  const locale = resolveLocale(currentLocale ?? config.site.lang);
  const t = useTranslations(locale);
  const posts = await getCollection("posts");
  const sortedPosts = getPostsForLocale(posts, locale);

  return rss({
    title: config.site.title,
    description: t.site.description,
    site: config.site.url,
    items: sortedPosts.map(({ data, id, filePath }) => ({
      link: getPostUrl(id, filePath, locale),
      title: data.title,
      description: data.description,
      pubDate: new Date(data.modDatetime ?? data.pubDatetime),
    })),
  });
};
