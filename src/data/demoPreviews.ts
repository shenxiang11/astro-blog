export const DEMO_PREVIEWS = [
  "shanghai",
  "s65",
  "lanyard",
  "text-animations",
  "height-slider",
  "weight-slider",
  "elastic-slider",
  "glass-surface",
  "dual-range-slider",
] as const;

export type DemoKind = (typeof DEMO_PREVIEWS)[number];
