export const LOCALES = ["zh", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "zh" || value === "en";
}

export function resolveLocale(value?: string | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export type Localized<T> = Record<Locale, T>;

export function pickLocale<T>(value: Localized<T>, locale?: string | null): T {
  return value[resolveLocale(locale)];
}
