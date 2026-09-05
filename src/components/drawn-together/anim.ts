import { BASE_WIDTH } from "./path";

export const REVEAL = 2500;
export const HOLD = 833;
export const VANISH = 1000;
export const TOTAL = REVEAL + HOLD + VANISH;

const PALETTE_HEX = [
  "#00D4FF",
  "#2B5CFF",
  "#9B5EFF",
  "#FF2D9B",
  "#FF6B2B",
  "#B44AFF",
];

type Lab = { L: number; a: number; b: number };

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number) {
  const x = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, x));
}

function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToRgb(lab: Lab) {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

const PALETTE = PALETTE_HEX.map(hex => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToOklab(r, g, b);
});

function mixLab(a: Lab, b: Lab, t: number): Lab {
  return {
    L: a.L + (b.L - a.L) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export type Rgb = { r: number; g: number; b: number };

export function colorAt(tSrc: number, colorShift: number): Rgb {
  const n = PALETTE.length;
  const pos = ((tSrc + colorShift) % 1) * n;
  const idx = Math.floor(pos);
  const frac = pos - idx;
  const eased = frac * frac * (3 - 2 * frac);
  const lab = mixLab(PALETTE[idx], PALETTE[(idx + 1) % n], eased);
  const rgb = oklabToRgb(lab);
  return {
    r: Math.round(rgb.r * 255),
    g: Math.round(rgb.g * 255),
    b: Math.round(rgb.b * 255),
  };
}

export function rgba(rgb: Rgb, a: number) {
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.min(1, Math.max(0, a))})`;
}

export function clamp(v: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v));
}

export function interpolate(
  t: number,
  keys: readonly [number, number],
  values: readonly [number, number]
) {
  const span = keys[1] - keys[0] || 1;
  const u = clamp((t - keys[0]) / span);
  return values[0] + (values[1] - values[0]) * u;
}

function easeIn(t: number) {
  return t * t;
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const xEst = sampleX(t) - x;
      const d = sampleDX(t);
      if (Math.abs(xEst) < 1e-6 || Math.abs(d) < 1e-6) break;
      t = clamp(t - xEst / d);
    }
    return sampleY(t);
  };
}

const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
const diveEase = cubicBezier(0.12, 0, 0.39, 0);

export type FrameState = {
  pathStart: number;
  pathEnd: number;
  strokeProgress: number;
  vanish: number;
  colorShift: number;
  glowIntensity: number;
  zoom: number;
};

export function frameAt(time: number, reduceMotion: boolean): FrameState {
  if (reduceMotion) {
    return {
      pathStart: 0,
      pathEnd: 1,
      strokeProgress: 1,
      vanish: 0,
      colorShift: 0.2,
      glowIntensity: 0.7,
      zoom: 1.08,
    };
  }

  const t = ((time % TOTAL) + TOTAL) % TOTAL;
  const revealU = clamp(t / REVEAL);
  const revealE = easeInOut(revealU);
  const inVanish = t > REVEAL + HOLD;
  const vanishU = inVanish ? easeIn((t - REVEAL - HOLD) / VANISH) : 0;

  return {
    pathStart: inVanish ? 0.5 * vanishU : 0,
    pathEnd: inVanish ? 1 - 0.5 * vanishU : revealE,
    strokeProgress: revealE,
    vanish: vanishU,
    colorShift: (t / TOTAL) * 0.6,
    glowIntensity: clamp(t / REVEAL) * 0.7,
    zoom:
      t <= REVEAL + HOLD
        ? 1 + 0.15 * (t / (REVEAL + HOLD))
        : 1.15 + 0.85 * diveEase((t - REVEAL - HOLD) / VANISH),
  };
}

export function localFade(ctxT: number, fade: number) {
  const center = 4 * ctxT * (1 - ctxT);
  const fadeStart = 0.5 * center;
  const fadeEnd = 0.5 + 0.5 * center;
  if (fadeEnd <= fadeStart) return fade >= fadeStart ? 1 : 0;
  return clamp((fade - fadeStart) / (fadeEnd - fadeStart));
}

export function strokeWidthAt(tSrc: number, progress: number) {
  const head = interpolate(progress, [0.9, 1], [BASE_WIDTH * 1.7, BASE_WIDTH]);
  return interpolate(tSrc, [progress - 0.5, progress], [BASE_WIDTH, head]);
}
