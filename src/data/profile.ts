export type ProfileMark = {
  name: string;
  href: string;
  src: string;
};

export const profile = {
  name: "Xiang Shen",
  role: "Software Engineer",
  email: "863461783@qq.com",
  handle: "xiangshen",
  status: "在线",
  aboutTitle: "# About Me.",
  lines: [
    "👨🏻‍💻  iOS ｜ Android ｜ 服务端 ｜ WEB",
    "🏷  专业发呆选手 | 偶尔失踪人口",
    "📝  夜空中最亮的星请指引我靠近你",
  ],
  schools: [
    {
      name: "西南大学",
      href: "https://www.swu.edu.cn/",
      src: "profile/schools/swu.svg",
    },
  ] satisfies ProfileMark[],
  contacts: [
    {
      name: "小红书",
      href: "https://www.xiaohongshu.com/user/profile/557d2cefe58d132ce601f14b",
      src: "profile/socials/xiaohongshu.svg",
    },
    {
      name: "抖音",
      href: "https://www.douyin.com/user/MS4wLjABAAAAs-q2ePzerTP5xp8mWszKCHf9JrrDO4HRwDkbnLqLz8Q",
      src: "profile/socials/douyin.svg",
    },
    {
      name: "GitHub",
      href: "https://github.com/shenxiang11",
      src: "profile/socials/github.svg",
    },
  ] satisfies ProfileMark[],
};
