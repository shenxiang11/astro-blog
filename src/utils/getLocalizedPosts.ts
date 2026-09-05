import type { CollectionEntry } from "astro:content";
import {
  DEFAULT_LOCALE,
  resolveLocale,
  type Locale,
} from "@/i18n/locales";
import { getPostSlugPath } from "./getPostPaths";
import { getSortedPosts } from "./getSortedPosts";
import { postFilter } from "./postFilter";

export function getPostLang(post: CollectionEntry<"posts">): Locale {
  return resolveLocale(post.data.lang);
}

export function getPostKey(post: CollectionEntry<"posts">): string {
  return getPostSlugPath(post.id, post.filePath);
}

export function groupPostsByKey(posts: CollectionEntry<"posts">[]) {
  const groups = new Map<string, CollectionEntry<"posts">[]>();
  for (const post of posts) {
    const key = getPostKey(post);
    const versions = groups.get(key) ?? [];
    versions.push(post);
    groups.set(key, versions);
  }
  return groups;
}

export function pickPostForLocale(
  versions: CollectionEntry<"posts">[],
  locale?: string | null
): CollectionEntry<"posts"> | undefined {
  const resolved = resolveLocale(locale);
  return (
    versions.find(post => getPostLang(post) === resolved) ??
    versions.find(post => getPostLang(post) === DEFAULT_LOCALE) ??
    versions[0]
  );
}

/** One post per article, preferring the matching locale then Chinese. */
export function getPostsForLocale(
  posts: CollectionEntry<"posts">[],
  locale?: string | null
) {
  const groups = groupPostsByKey(posts.filter(postFilter));
  const picked = [...groups.values()]
    .map(versions => pickPostForLocale(versions, locale))
    .filter((post): post is CollectionEntry<"posts"> => post != null);

  return getSortedPosts(picked);
}

export function localizePosts(
  posts: CollectionEntry<"posts">[],
  allPosts: CollectionEntry<"posts">[],
  locale?: string | null
) {
  const byKey = new Map(
    getPostsForLocale(allPosts, locale).map(post => [getPostKey(post), post])
  );
  return posts.map(post => byKey.get(getPostKey(post)) ?? post);
}
