import { resolveLocale } from "@/i18n/locales";

const TAG_EN: Record<string, string> = {
  动画: "Animation",
  嵌套滚动: "Nested scrolling",
};

export function tagLabel(tagName: string, locale?: string | null): string {
  if (resolveLocale(locale) !== "en") return tagName;
  return TAG_EN[tagName] ?? tagName;
}
