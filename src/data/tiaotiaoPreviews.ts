import type { ImageMetadata } from "astro";
import summary from "@/assets/tiaotiao/01-summary.jpg";
import modes from "@/assets/tiaotiao/02-modes.jpg";
import records from "@/assets/tiaotiao/03-records.png";
import detail from "@/assets/tiaotiao/04-detail.jpg";
import share from "@/assets/tiaotiao/05-share.jpg";
import watch from "@/assets/tiaotiao/06-watch.jpg";

export const tiaotiaoPreviews: {
  src: ImageMetadata;
  alt: string;
}[] = [
  {
    src: summary,
    alt: "今天跳满了没。圆环看跳跃、时长、消耗。",
  },
  {
    src: modes,
    alt: "三种方式，随便跳。自由跳、目标、间歇都能选；摄像头、AirPods、手表从手机点开始就行。",
  },
  {
    src: records,
    alt: "健身记录都在这里。次数、时长、节奏、消耗、心率，跳完一眼能看完。",
  },
  {
    src: detail,
    alt: "这次跳了多少。下数、时长、节奏、消耗、心率，跳完一眼能看到。",
  },
  {
    src: share,
    alt: "跳完就能发。生成一张海报，存相册或发给别人。",
  },
  {
    src: watch,
    alt: "手腕上就能开始。在手表上选模式、看次数和进度。",
  },
];
