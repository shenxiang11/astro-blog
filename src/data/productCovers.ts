import type { ImageMetadata } from "astro";
import type { Product } from "@/data/products";
import miaotie from "@/assets/miaotie/home.png";
import tiaotiao from "@/assets/tiaotiao/home.png";
import harbor from "@/assets/harbor/home.png";
import pushtester from "@/assets/pushtester/home.png";
import tidy from "@/assets/tidy/home.png";

export const productCovers: Record<Product["id"], ImageMetadata> = {
  miaotie,
  tiaotiao,
  harbor,
  pushtester,
  tidy,
};
