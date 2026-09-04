export type Library = {
  id: string;
  name: string;
  description: string;
  platforms: string[];
  repo: string;
  article?: string;
  demo?: string;
  order?: number;
};

export const libraries: Library[] = [
  {
    id: "vapkit-web",
    name: "VAPKit Web",
    description:
      "Web 上的 VAP 礼物动画播放器。读 MP4 里的 vapc，用浏览器解码，WebGL 按同一帧里的 RGB 和灰阶 Alpha 合成透明动画。",
    platforms: ["TypeScript", "WebGL"],
    repo: "https://github.com/shenxiang11/vapkit-web",
    demo: "https://vapkit-web-demo.vercel.app/",
    order: 1,
  },
  {
    id: "vapkit",
    name: "VAPKit",
    description:
      "iOS 上的 VAP 礼物动画播放器。读 MP4 里的 vapc，用 AVAssetReader 解码，Metal 把同一帧里的 RGB 和灰阶 Alpha 合成透明动画。",
    platforms: ["SwiftUI", "UIKit", "Metal"],
    repo: "https://github.com/shenxiang11/vapkit",
    article: "posts/vapkit-same-frame-alpha",
    order: 2,
  },
  {
    id: "vapkit-android",
    name: "VAPKit Android",
    description:
      "Android 上的 VAP 礼物动画播放器。读 MP4 里的 vapc，用 MediaCodec 解码，OpenGL ES 按同一帧里的 RGB 和灰阶 Alpha 合成透明动画。",
    platforms: ["Kotlin", "MediaCodec", "OpenGL ES"],
    repo: "https://github.com/shenxiang11/vapkit-android",
    order: 3,
  },
  {
    id: "nested-paging",
    name: "NestedPaging",
    description:
      "UIKit 嵌套滚动容器：封面收起、分类栏吸顶，底下多个列表既能自己滚，也能左右换页。",
    platforms: ["UIKit", "Swift"],
    repo: "https://github.com/shenxiang11/NestedPaging",
    article: "posts/nested-paging-offset-locking",
    order: 4,
  },
];

export function getSortedLibraries() {
  return [...libraries].sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}
