export const DEMO_PREVIEWS = [
  "s65",
  "vapkit",
  "lanyard",
  "text-animations",
  "height-slider",
  "weight-slider",
  "elastic-slider",
] as const;

export type DemoKind = (typeof DEMO_PREVIEWS)[number];
