import type { ImageMetadata } from "astro";
import { pickLocale, type Localized } from "@/i18n/locales";
import summary from "@/assets/tiaotiao/01-summary.jpg";
import modes from "@/assets/tiaotiao/02-modes.jpg";
import records from "@/assets/tiaotiao/03-records.png";
import detail from "@/assets/tiaotiao/04-detail.jpg";
import share from "@/assets/tiaotiao/05-share.jpg";
import watch from "@/assets/tiaotiao/06-watch.jpg";

export const tiaotiaoPreviews: {
  src: ImageMetadata;
  alt: Localized<string>;
}[] = [
  {
    src: summary,
    alt: {
      zh: "今天跳满了没。圆环看跳跃、时长、消耗。",
      en: "Did you fill the rings today? Jumps, duration, and burn at a glance.",
    },
  },
  {
    src: modes,
    alt: {
      zh: "三种方式，随便跳。自由跳、目标、间歇都能选；摄像头、AirPods、手表从手机点开始就行。",
      en: "Three ways to jump. Free, goal, or interval; start from the phone with camera, AirPods, or Watch.",
    },
  },
  {
    src: records,
    alt: {
      zh: "健身记录都在这里。次数、时长、节奏、消耗、心率，跳完一眼能看完。",
      en: "Your workout history is here. Count, duration, cadence, burn, and heart rate after each jump.",
    },
  },
  {
    src: detail,
    alt: {
      zh: "这次跳了多少。下数、时长、节奏、消耗、心率，跳完一眼能看到。",
      en: "How this session went. Count, duration, cadence, burn, and heart rate in one view.",
    },
  },
  {
    src: share,
    alt: {
      zh: "跳完就能发。生成一张海报，存相册或发给别人。",
      en: "Share when you finish. Make a poster, save it, or send it.",
    },
  },
  {
    src: watch,
    alt: {
      zh: "手腕上就能开始。在手表上选模式、看次数和进度。",
      en: "Start from your wrist. Pick a mode and watch the count and progress.",
    },
  },
];

export function getTiaoTiaoPreviews(locale?: string | null) {
  return tiaotiaoPreviews.map(preview => ({
    src: preview.src,
    alt: pickLocale(preview.alt, locale),
  }));
}
