export const DEMO_PREVIEWS = [
  "circular-reveal",
  "clip-stack",
  "jump-ring",
  "flip-card",
  "ripple",
  "streaming",
  "carousel",
  "liquid-glass",
  "pixel-wave",
] as const;

export type DemoKind = (typeof DEMO_PREVIEWS)[number];
