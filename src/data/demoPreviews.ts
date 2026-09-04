export const DEMO_PREVIEWS = [
  "s65",
  "lanyard",
  "text-animations",
  "height-slider",
  "weight-slider",
  "elastic-slider",
  "glass-surface",
] as const;

export type DemoKind = (typeof DEMO_PREVIEWS)[number];
