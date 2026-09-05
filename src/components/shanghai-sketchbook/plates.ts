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
  placeEn: string;
  src: string;
};

export const PLATES: Plate[] = [
  {
    id: "bund",
    title: "外滩",
    english: "The Bund",
    place: "黄浦江",
    placeEn: "Huangpu River",
    src: theBund,
  },
  {
    id: "yuyuan",
    title: "豫园",
    english: "Yu Garden",
    place: "老城厢",
    placeEn: "Old City",
    src: yuGarden,
  },
  {
    id: "wukang",
    title: "武康大楼",
    english: "Wukang Building",
    place: "徐汇",
    placeEn: "Xuhui",
    src: wukang,
  },
  {
    id: "waibaidu",
    title: "外白渡桥",
    english: "Waibaidu Bridge",
    place: "苏州河",
    placeEn: "Suzhou Creek",
    src: waibaidu,
  },
  {
    id: "nanjing",
    title: "南京路",
    english: "Nanjing Road",
    place: "黄浦",
    placeEn: "Huangpu",
    src: nanjingRoad,
  },
  {
    id: "jingan",
    title: "静安寺",
    english: "Jing'an Temple",
    place: "静安",
    placeEn: "Jing'an",
    src: jingan,
  },
  {
    id: "hengshan",
    title: "衡山路",
    english: "Hengshan Road",
    place: "衡复",
    placeEn: "Hengfu",
    src: hengshan,
  },
  {
    id: "tianzifang",
    title: "田子坊",
    english: "Tianzifang",
    place: "石库门",
    placeEn: "Shikumen",
    src: tianzifang,
  },
  {
    id: "zhujiajiao",
    title: "朱家角",
    english: "Zhujiajiao",
    place: "青浦",
    placeEn: "Qingpu",
    src: zhujiajiao,
  },
];
