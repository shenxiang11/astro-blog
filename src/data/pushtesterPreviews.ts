import type { ImageMetadata } from "astro";
import { pickLocale, type Localized } from "@/i18n/locales";
import composer from "@/assets/pushtester/home.png";
import payload from "@/assets/pushtester/02-payload.png";
import providers from "@/assets/pushtester/03-providers.png";

export const pushtesterPreviews: {
  src: ImageMetadata;
  alt: Localized<string>;
}[] = [
  {
    src: composer,
    alt: {
      zh: "选好通道，贴上令牌，编辑 JSON，旁边就能预览通知。",
      en: "Pick a provider, paste a token, edit JSON, and preview the notification beside it.",
    },
  },
  {
    src: payload,
    alt: {
      zh: "载荷和预览并排。改标题、正文、声音，发送前先看一眼。",
      en: "Payload and preview side by side. Change title, body, and sound before you send.",
    },
  },
  {
    src: providers,
    alt: {
      zh: "APNs、FCM、华为、小米、OPPO、vivo，侧边栏直接换。",
      en: "APNs, FCM, Huawei, Xiaomi, OPPO, vivo — switch from the sidebar.",
    },
  },
];

export function getPushTesterPreviews(locale?: string | null) {
  return pushtesterPreviews.map(preview => ({
    src: preview.src,
    alt: pickLocale(preview.alt, locale),
  }));
}
