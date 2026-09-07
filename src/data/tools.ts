import { pickLocale, type Localized } from "@/i18n/locales";

export type Tool = {
  id: string;
  name: Localized<string>;
  description: Localized<string>;
  tags: string[];
  url: string;
  order?: number;
};

export type LocalizedTool = Omit<Tool, "name" | "description"> & {
  name: string;
  description: string;
};

export const tools: Tool[] = [
  {
    id: "markdown2pdf",
    name: {
      zh: "Markdown 转 PDF",
      en: "Markdown to PDF",
    },
    description: {
      zh: "把 Markdown 转成 PDF。免费，无水印，不用登录。可调字体、配色和排版。",
      en: "Turn Markdown into a PDF. Free, no watermark, no account. Tune fonts, colors, and layout.",
    },
    tags: ["Markdown", "PDF"],
    url: "https://markdown2pdf-murex.vercel.app/",
    order: 1,
  },
  {
    id: "jsonview",
    name: {
      zh: "JSON 查看器",
      en: "JSON Viewer",
    },
    description: {
      zh: "超大 JSON 也不卡。免费，无广告，本地解析不上传。树形折叠、搜索、格式化与压缩。",
      en: "Browse huge JSON without freezing. Free, no ads, parsed locally. Tree view, search, format, and minify.",
    },
    tags: ["JSON"],
    url: "https://jsonview-tau.vercel.app/",
    order: 2,
  },
  {
    id: "svg2any",
    name: {
      zh: "SVG 转原生代码",
      en: "SVG to Native Code",
    },
    description: {
      zh: "把 SVG 转成 SwiftUI、UIKit、Android、Compose、Flutter、RN 和 Web 代码。免费，无广告，本地转换。",
      en: "Turn SVG into SwiftUI, UIKit, Android, Compose, Flutter, RN, and Web code. Free, no ads, converted locally.",
    },
    tags: ["SVG"],
    url: "https://svg2any.vercel.app/",
    order: 3,
  },
];

export function getSortedTools(locale?: string | null): LocalizedTool[] {
  return [...tools]
    .sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    })
    .map(tool => ({
      ...tool,
      name: pickLocale(tool.name, locale),
      description: pickLocale(tool.description, locale),
    }));
}
