export type Product = {
  id: "miaotie" | "tiaotiao" | "harbor";
  name: string;
  nameEn: string;
  href: string;
  navLabel: string;
  kicker: string;
  title: string;
  description: string;
  features: string[];
  platforms: string[];
  supportHref: string;
  privacyHref: string;
  visual: "clipboard" | "jump" | "harbor";
  gradient: string;
  /** Live App Store listing. `null` until the app is published. */
  appStoreUrl?: string | null;
  /** Direct download, e.g. GitHub Releases. */
  downloadUrl?: string;
};

export const products: Product[] = [
  {
    id: "miaotie",
    name: "妙贴",
    nameEn: "MyPaste",
    href: "/miaotie",
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
    platforms: ["Mac", "iPhone"],
    supportHref: "/support",
    privacyHref: "/privacy",
    visual: "harbor",
    gradient: "from-[#22c55e] via-[#16a34a] to-[#052e16]",
  },
];

export function getProduct(id: Product["id"]) {
  const product = products.find(item => item.id === id);
  if (!product) throw new Error(`Unknown product: ${id}`);
  return product;
}
