import type { CollectionEntry } from "astro:content";

export function getSortedDemos(demos: CollectionEntry<"demos">[]) {
  return demos
    .filter(demo => !demo.data.draft)
    .sort((a, b) => {
      const orderA = a.data.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.data.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return (
        new Date(b.data.pubDatetime).getTime() -
        new Date(a.data.pubDatetime).getTime()
      );
    });
}
