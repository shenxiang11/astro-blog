import type { ImageMetadata } from "astro";
import type { Product } from "@/data/products";
import miaotie from "@/assets/miaotie/home.png";
import tiaotiao from "@/assets/tiaotiao/home.png";
import harbor from "@/assets/harbor/home.png";

export const productCovers: Record<Product["id"], ImageMetadata> = {
  miaotie,
  tiaotiao,
  harbor,
};
