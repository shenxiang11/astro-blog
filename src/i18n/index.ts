import type { UIStrings } from "./types";

export { tplStr } from "./format";
export {
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  resolveLocale,
  pickLocale,
  type Locale,
  type Localized,
} from "./locales";
export { pathWithoutLocale, localeHref, localeAlternates } from "./path";

const modules = import.meta.glob<{ default: UIStrings }>("./lang/*.ts", {
  eager: true,
});

const translations: Record<string, UIStrings> = {};
for (const [path, mod] of Object.entries(modules)) {
  const locale = path.slice("./lang/".length, -".ts".length);
  translations[locale] = mod.default;
}

/** Returns UI strings for the given locale, falling back to Chinese then English. */
export function useTranslations(locale: string = "zh"): UIStrings {
  return translations[locale] ?? translations["zh"] ?? translations["en"];
}
