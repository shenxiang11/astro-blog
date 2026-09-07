import { pickLocale, type Localized } from "@/i18n/locales";

export type ProductCopy = {
  navLabel: string;
  kicker: string;
  title: string;
  description: string;
  features: string[];
};

export type Product = {
  id: "miaotie" | "tiaotiao" | "harbor" | "pushtester";
  name: string;
  nameEn: string;
  href: string;
  copy: Localized<ProductCopy>;
  platforms: string[];
  supportHref: string;
  privacyHref: string;
  visual: "clipboard" | "jump" | "harbor" | "push";
  gradient: string;
  /** Live App Store listing. `null` until the app is published. */
  appStoreUrl?: string | null;
  /** Direct download, e.g. GitHub Releases. */
  downloadUrl?: string;
};

export type LocalizedProduct = Omit<Product, "copy"> & ProductCopy;

export const products: Product[] = [
  {
    id: "miaotie",
    name: "妙贴",
    nameEn: "MyPaste",
    href: "/miaotie",
    copy: {
      zh: {
        navLabel: "妙贴",
        kicker: "剪贴板历史",
        title: "复制过的，都还在",
        description:
          "妙贴帮你在 Mac 和 iPhone 上找回最近复制的文本、图片、链接、文件和颜色。没有账号，没有上传，历史只留在你的设备上。",
        features: [
          "文本、图片、链接、文件、颜色",
          "Mac 快捷键呼出，点选即贴",
          "默认跳过密码框和私密剪贴板",
          "无需登录，无隐私收集",
          "历史保存在本机",
        ],
      },
      en: {
        navLabel: "MyPaste",
        kicker: "Clipboard history",
        title: "Everything you copied is still here",
        description:
          "MyPaste helps you recover recently copied text, images, links, files, and colors on Mac and iPhone. No account, no upload — history stays on your device.",
        features: [
          "Text, images, links, files, and colors",
          "Summon with a Mac shortcut, click to paste",
          "Skips password fields and confidential clipboard items by default",
          "No sign-in, no data collection",
          "History stays on this device",
        ],
      },
    },
    platforms: ["Mac", "iPhone"],
    supportHref: "/support",
    privacyHref: "/privacy",
    visual: "clipboard",
    gradient: "from-[#7c5cfc] via-[#5b4dff] to-[#1e1b4b]",
    downloadUrl: "https://github.com/shenxiang11/MyPaste/releases",
  },
  {
    id: "tiaotiao",
    name: "跳跳",
    nameEn: "TiaoTiao",
    href: "/tiaotiao",
    copy: {
      zh: {
        navLabel: "跳跳",
        kicker: "跳绳计数",
        title: "跳一下，就算一下",
        description:
          "跳跳用摄像头、AirPods 或 Apple Watch 帮你数跳绳。跳完看圆环和记录，不用注册，不用登录。",
        features: [
          "摄像头 / AirPods / Apple Watch 计数",
          "圆环、记录和海报",
          "可选写入健康 App",
          "无需登录，无隐私收集",
          "记录保存在本机",
        ],
      },
      en: {
        navLabel: "TiaoTiao",
        kicker: "Jump-rope counter",
        title: "One jump, one count",
        description:
          "TiaoTiao counts jump rope with the camera, AirPods, or Apple Watch. After you jump, check the rings and records. No sign-up, no sign-in.",
        features: [
          "Count with camera / AirPods / Apple Watch",
          "Rings, records, and posters",
          "Optional Health app write",
          "No sign-in, no data collection",
          "Records stay on this device",
        ],
      },
    },
    platforms: ["iPhone", "Apple Watch"],
    appStoreUrl: null,
    supportHref: "/tiaotiao/support",
    privacyHref: "/tiaotiao/privacy",
    visual: "jump",
    gradient: "from-[#22c55e] via-[#16a34a] to-[#14532d]",
  },
  {
    id: "harbor",
    name: "Harbor",
    nameEn: "Harbor",
    href: "/harbor",
    copy: {
      zh: {
        navLabel: "Harbor",
        kicker: "科学上网",
        title: "点一下，就出海",
        description:
          "Harbor 是给 Mac 和 iPhone 用的科学上网客户端。贴上订阅，选好节点，点中间那个按钮就能连上。规则、全局、直连三种模式，流量怎么走你自己定。",
        features: [
          "一键连接，状态和时长一眼能看清",
          "规则 / 全局 / 直连，三种分流",
          "订阅链接，节点随时换",
          "实时上传、下载流量",
          "Mac 和 iPhone 同一套用法",
        ],
      },
      en: {
        navLabel: "Harbor",
        kicker: "Proxy client",
        title: "One tap, you're out",
        description:
          "Harbor is a proxy client for Mac and iPhone. Paste a subscription, pick a node, tap the button in the middle. Rule, global, or direct — you decide how traffic flows.",
        features: [
          "Connect in one tap; status and duration at a glance",
          "Rule / global / direct routing",
          "Subscription links, switch nodes anytime",
          "Live upload and download stats",
          "The same flow on Mac and iPhone",
        ],
      },
    },
    platforms: ["Mac", "iPhone"],
    supportHref: "/support",
    privacyHref: "/privacy",
    visual: "harbor",
    gradient: "from-[#22c55e] via-[#16a34a] to-[#052e16]",
  },
  {
    id: "pushtester",
    name: "Push Tester",
    nameEn: "Push Tester",
    href: "/pushtester",
    copy: {
      zh: {
        navLabel: "Push Tester",
        kicker: "推送测试",
        title: "发一条，就知道通不通",
        description:
          "Push Tester 是给真机发测试推送的 macOS 工具。直连 APNs、FCM 和华为 / 小米 / OPPO / vivo，没有自建后端。私钥和服务账号只进本机钥匙串。",
        features: [
          "APNs、FCM、华为、小米、OPPO、vivo",
          "JSON 载荷编辑，旁边就能预览通知",
          "历史可重放，令牌和密钥会遮罩",
          "凭证留在钥匙串，不经过自建服务器",
          "仓库里带 iOS / Android 示例收件 App",
        ],
      },
      en: {
        navLabel: "Push Tester",
        kicker: "Push testing",
        title: "Send one. You'll know it landed.",
        description:
          "Push Tester is a macOS app for sending test pushes to real devices. It talks to APNs, FCM, and Huawei / Xiaomi / OPPO / vivo — no backend of yours in the middle. Keys and service accounts stay in the Keychain.",
        features: [
          "APNs, FCM, Huawei, Xiaomi, OPPO, vivo",
          "Edit JSON payloads with a live notification preview",
          "Replay history; tokens and secrets are masked",
          "Credentials stay in Keychain, never hit a first-party server",
          "iOS and Android sample apps in the repo",
        ],
      },
    },
    platforms: ["Mac"],
    supportHref: "/support",
    privacyHref: "/privacy",
    visual: "push",
    gradient: "from-[#6366f1] via-[#4f46e5] to-[#1e1b4b]",
    downloadUrl: "https://github.com/shenxiang11/PushTester",
  },
];

export function getProduct(id: Product["id"]) {
  const product = products.find(item => item.id === id);
  if (!product) throw new Error(`Unknown product: ${id}`);
  return product;
}

export function localizeProduct(
  product: Product,
  locale?: string | null
): LocalizedProduct {
  const copy = pickLocale(product.copy, locale);
  const lang = locale === "en" ? "en" : "zh";
  return {
    ...product,
    name: lang === "en" ? product.nameEn : product.name,
    ...copy,
  };
}

export function getLocalizedProduct(
  id: Product["id"],
  locale?: string | null
): LocalizedProduct {
  return localizeProduct(getProduct(id), locale);
}

export function getLocalizedProducts(locale?: string | null): LocalizedProduct[] {
  return products.map(product => localizeProduct(product, locale));
}
