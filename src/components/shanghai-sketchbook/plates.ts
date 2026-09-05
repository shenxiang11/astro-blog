import theBund from "@/assets/shanghai/the-bund.png?url";
import yuGarden from "@/assets/shanghai/yu-garden.png?url";
import wukang from "@/assets/shanghai/wukang.png?url";
import waibaidu from "@/assets/shanghai/waibaidu.png?url";
import nanjingRoad from "@/assets/shanghai/nanjing-road.png?url";
import jingan from "@/assets/shanghai/jingan.png?url";
import hengshan from "@/assets/shanghai/hengshan.png?url";
import tianzifang from "@/assets/shanghai/tianzifang.png?url";
import zhujiajiao from "@/assets/shanghai/zhujiajiao.png?url";

export type Plate = {
  id: string;
  title: string;
  english: string;
  place: string;
  src: string;
};

export const PLATES: Plate[] = [
  {
    id: "bund",
    title: "外滩",
    english: "The Bund",
    place: "黄浦江",
    src: theBund,
  },
  {
    id: "yuyuan",
    title: "豫园",
    english: "Yu Garden",
    place: "老城厢",
    src: yuGarden,
  },
  {
    id: "wukang",
    title: "武康大楼",
    english: "Wukang Building",
    place: "徐汇",
    src: wukang,
  },
  {
    id: "waibaidu",
    title: "外白渡桥",
    english: "Waibaidu Bridge",
    place: "苏州河",
    src: waibaidu,
  },
  {
    id: "nanjing",
    title: "南京路",
    english: "Nanjing Road",
    place: "黄浦",
    src: nanjingRoad,
  },
  {
    id: "jingan",
    title: "静安寺",
    english: "Jing'an Temple",
    place: "静安",
    src: jingan,
  },
  {
    id: "hengshan",
    title: "衡山路",
    english: "Hengshan Road",
    place: "衡复",
    src: hengshan,
  },
  {
    id: "tianzifang",
    title: "田子坊",
    english: "Tianzifang",
    place: "石库门",
    src: tianzifang,
  },
  {
    id: "zhujiajiao",
    title: "朱家角",
    english: "Zhujiajiao",
    place: "青浦",
    src: zhujiajiao,
  },
];
