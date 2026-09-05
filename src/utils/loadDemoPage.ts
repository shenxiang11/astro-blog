import { getEntry } from "astro:content";
import { demoCopy } from "./demoCopy";

export async function loadDemoPage(id: string, locale?: string | null) {
  const demo = await getEntry("demos", id);
  if (!demo) throw new Error(`Missing demo entry: ${id}`);
  return { demo, ...demoCopy(demo, locale) };
}
