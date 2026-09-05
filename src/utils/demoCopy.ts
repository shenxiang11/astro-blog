import type { CollectionEntry } from "astro:content";
import { resolveLocale } from "@/i18n/locales";

export function demoCopy(
  demo: CollectionEntry<"demos">,
  locale?: string | null
) {
  const en = resolveLocale(locale) === "en";
  const { title, subtitle, titleEn, subtitleEn, description, descriptionEn } =
    demo.data;

  return {
    title: en ? (titleEn ?? title) : title,
    subtitle: en ? (subtitleEn ?? subtitle) : subtitle,
    description: en
      ? (descriptionEn ?? subtitleEn ?? subtitle)
      : (description ?? subtitle),
  };
}
