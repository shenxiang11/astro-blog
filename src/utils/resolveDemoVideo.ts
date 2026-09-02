import type { CollectionEntry } from "astro:content";
import path from "node:path";

const demoVideos = import.meta.glob<string>("../content/demos/**/*.{mp4,webm,mov}", {
  eager: true,
  query: "?url",
  import: "default",
});

function normalize(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

function globKeyToSrc(key: string) {
  return normalize(key).replace(/^\.\.\//, "src/");
}

/** Resolve a demo `video` frontmatter value to a URL the browser can play. */
export function resolveDemoVideo(
  demo: CollectionEntry<"demos">
): string | undefined {
  const video = demo.data.video;
  if (!video) return;

  if (
    video.startsWith("http://") ||
    video.startsWith("https://") ||
    video.startsWith("/")
  ) {
    return video;
  }

  const filePath = demo.filePath && normalize(demo.filePath);
  const target = filePath
    ? normalize(path.posix.join(path.posix.dirname(filePath), video))
    : video.replace(/^\.\//, "");
  const filename = video.replace(/^\.\//, "");

  for (const [key, url] of Object.entries(demoVideos)) {
    const srcPath = globKeyToSrc(key);
    if (srcPath === target || srcPath.endsWith(`/${filename}`)) {
      return url;
    }
  }
}
