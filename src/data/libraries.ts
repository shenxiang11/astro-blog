import { pickLocale, type Localized } from "@/i18n/locales";

export type Library = {
  id: string;
  name: string;
  description: Localized<string>;
  platforms: string[];
  repo: string;
  article?: string;
  demo?: string;
  order?: number;
};

export type LocalizedLibrary = Omit<Library, "description"> & {
  description: string;
};

export const libraries: Library[] = [
  {
    id: "vapkit-web",
    name: "VAPKit Web",
    description: {
      zh: "Web 上的 VAP 礼物动画播放器。读 MP4 里的 vapc，用浏览器解码，WebGL 按同一帧里的 RGB 和灰阶 Alpha 合成透明动画。",
      en: "A VAP gift animation player for the web. It reads vapc from an MP4, decodes it in the browser, and composites RGB plus grayscale alpha from the same frame in WebGL.",
    },
    platforms: ["TypeScript", "WebGL"],
    repo: "https://github.com/shenxiang11/vapkit-web",
    demo: "https://vapkit-web-demo.vercel.app/",
    order: 1,
  },
  {
    id: "vapkit",
    name: "VAPKit",
    description: {
      zh: "iOS 上的 VAP 礼物动画播放器。读 MP4 里的 vapc，用 AVAssetReader 解码，Metal 把同一帧里的 RGB 和灰阶 Alpha 合成透明动画。",
      en: "A VAP gift animation player for iOS. It reads vapc from an MP4, decodes with AVAssetReader, and composites RGB plus grayscale alpha from the same frame in Metal.",
    },
    platforms: ["SwiftUI", "UIKit", "Metal"],
    repo: "https://github.com/shenxiang11/vapkit",
    article: "posts/vapkit-same-frame-alpha",
    order: 2,
  },
  {
    id: "vapkit-android",
    name: "VAPKit Android",
    description: {
      zh: "Android 上的 VAP 礼物动画播放器。读 MP4 里的 vapc，用 MediaCodec 解码，OpenGL ES 按同一帧里的 RGB 和灰阶 Alpha 合成透明动画。",
      en: "A VAP gift animation player for Android. It reads vapc from an MP4, decodes with MediaCodec, and composites RGB plus grayscale alpha from the same frame in OpenGL ES.",
    },
    platforms: ["Kotlin", "MediaCodec", "OpenGL ES"],
    repo: "https://github.com/shenxiang11/vapkit-android",
    order: 3,
  },
  {
    id: "nested-paging",
    name: "NestedPaging",
    description: {
      zh: "UIKit 嵌套滚动容器：封面收起、分类栏吸顶，底下多个列表既能自己滚，也能左右换页。",
      en: "A UIKit nested-scroll container: the cover collapses, the category bar pins, and the lists below can scroll on their own or page sideways.",
    },
    platforms: ["UIKit", "Swift"],
    repo: "https://github.com/shenxiang11/NestedPaging",
    article: "posts/nested-paging-offset-locking",
    order: 4,
  },
];

export function getSortedLibraries(locale?: string | null): LocalizedLibrary[] {
  return [...libraries]
    .sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    })
    .map(library => ({
      ...library,
      description: pickLocale(library.description, locale),
    }));
}
