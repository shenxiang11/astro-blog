import type { ImageMetadata } from "astro";
import miaotie from "@/assets/miaotie/home.png";
import tiaotiao from "@/assets/tiaotiao/home.png";

export const productCovers: Record<"miaotie" | "tiaotiao", ImageMetadata> = {
  miaotie,
  tiaotiao,
};
