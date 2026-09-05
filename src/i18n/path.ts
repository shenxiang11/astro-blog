import { getRelativeLocaleUrl } from "astro:i18n";
import { stripBase, stripLocale } from "@/utils/withBase";
import { LOCALES, resolveLocale, type Locale } from "./locales";

/** Logical path without base or locale prefix, e.g. `/posts/foo`. */
export function pathWithoutLocale(
  pathname: string,
  locale?: string | null
): string {
  return stripLocale(stripBase(pathname), resolveLocale(locale));
}

/** Same page in another locale, e.g. `/posts` → `/en/posts`. */
export function localeHref(
  targetLocale: Locale,
  pathname: string,
  currentLocale?: string | null
): string {
  const path = pathWithoutLocale(pathname, currentLocale);
  const rest = path === "/" ? "" : path.replace(/^\//, "");
  return getRelativeLocaleUrl(targetLocale, rest);
}

export function localeAlternates(
  pathname: string,
  currentLocale?: string | null
): { locale: Locale; href: string }[] {
  return LOCALES.map(locale => ({
    locale,
    href: localeHref(locale, pathname, currentLocale),
  }));
}
