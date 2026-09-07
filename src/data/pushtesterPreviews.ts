import type { ImageMetadata } from "astro";
import { pickLocale, type Localized } from "@/i18n/locales";
import cover from "@/assets/pushtester/home.png";

export const pushtesterPreviews: {
  src: ImageMetadata;
  alt: Localized<string>;
}[] = [
  {
    src: cover,
    alt: {
      zh: "Mac 上编辑 payload，真机立刻弹出通信通知。",
      en: "Edit the payload on a Mac; a communication notification lands on a real iPhone.",
    },
  },
];

export function getPushTesterPreviews(locale?: string | null) {
  return pushtesterPreviews.map(preview => ({
    src: preview.src,
    alt: pickLocale(preview.alt, locale),
  }));
}
