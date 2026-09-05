export const PATH_SVG =
  "M13.6 247.8C13.6 247.8 51.8 206.1 84.2 168.8 140.8 103.4 202.8 27.1 150.1 14.3 131 9.7 116.4 29.3 107.3 44.8 69.7 108.4 58 213.8 57.5 302M58 302C67.7 271.3 104.4 190.3 140.2 192.5 181.5 195.1 145.3 257 154.5 283.8 168.8 321.6 208.2 292.3 230 276.9 265.9 251.5 289 230.7 289 199.9 289 161 235.3 173.5 223.3 204.6 213.9 228.9 214.3 265.3 229.3 283.6 247.5 305.7 287.7 309.4 312.2 287.9 337 266.2 354.7 234 368.7 212.5 403.9 158.3 464.4 85.6 449.1 29.5 447 21.9 440.4 16 432.5 15.7 393.6 14.2 381.8 98.6 375.3 128.8 368.8 159.3 345.2 260.8 373.1 292.5 404.4 328 446.3 261.9 464.7 231.1 468.7 224.8 472.6 217.9 476.1 212.5 511.3 158.4 571.8 85.6 556.5 29.5 554.4 21.9 547.8 16.1 539.9 15.8 501 14.2 489.2 98.7 482.8 128.8 476.2 159.3 452.6 260.8 480.5 292.6 511.8 328.1 562.4 265 572.6 232.3 587.3 185.4 620.9 171 660.9 179.7M660.9 179.7C616 166.1 580.9 199.1 572.6 232.6 566.8 256.4 573.5 281.6 599.2 295.2 668.5 331.9 742.8 211.1 660.9 179.7ZM660.9 179.7C643.7 181.3 636.1 204.2 643.3 227.2 654.3 263.4 704.3 267.7 733.1 255.5";

export const ARTBOARD_W = 1920;
export const ARTBOARD_H = 1080;
export const BASE_WIDTH = 45;

export type StrokePoint = {
  x: number;
  y: number;
  nx: number;
  ny: number;
  t: number;
};

type Token = string | number;

function tokenize(d: string): Token[] {
  const tokens: Token[] = [];
  const re = /[MmCcZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
  for (const match of d.matchAll(re)) {
    const piece = match[0];
    tokens.push(/[MmCcZz]/.test(piece) ? piece : Number(piece));
  }
  return tokens;
}

function cubic(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  t: number
) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0x + 3 * uu * t * p1x + 3 * u * tt * p2x + tt * t * p3x,
    y: uu * u * p0y + 3 * uu * t * p1y + 3 * u * tt * p2y + tt * t * p3y,
  };
}

function cubicLength(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number
) {
  const chord = Math.hypot(p3x - p0x, p3y - p0y);
  const net =
    Math.hypot(p1x - p0x, p1y - p0y) +
    Math.hypot(p2x - p1x, p2y - p1y) +
    Math.hypot(p3x - p2x, p3y - p2y);
  return (chord + net) / 2;
}

function flattenPath(d: string) {
  const tokens = tokenize(d);
  const points: { x: number; y: number }[] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let command = "M";

  const push = (px: number, py: number) => {
    const last = points[points.length - 1];
    if (last && Math.hypot(px - last.x, py - last.y) < 0.05) return;
    points.push({ x: px, y: py });
  };

  const addCubic = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number
  ) => {
    const len = cubicLength(x, y, x1, y1, x2, y2, x3, y3);
    const steps = Math.max(8, Math.ceil(len / 4));
    for (let s = 1; s <= steps; s++) {
      const p = cubic(x, y, x1, y1, x2, y2, x3, y3, s / steps);
      push(p.x, p.y);
    }
    x = x3;
    y = y3;
  };

  while (i < tokens.length) {
    const token = tokens[i];
    if (typeof token === "string") {
      command = token;
      i += 1;
      if (command === "Z" || command === "z") {
        push(sx, sy);
        x = sx;
        y = sy;
      }
      continue;
    }

    if (command === "M" || command === "m") {
      const nx = token;
      const ny = tokens[i + 1];
      if (typeof ny !== "number") break;
      if (command === "m") {
        x += nx;
        y += ny;
      } else {
        x = nx;
        y = ny;
      }
      sx = x;
      sy = y;
      push(x, y);
      i += 2;
      command = command === "m" ? "l" : "L";
      continue;
    }

    if (command === "C" || command === "c") {
      const nums = tokens.slice(i, i + 6);
      if (nums.length < 6 || nums.some(n => typeof n !== "number")) break;
      const [x1, y1, x2, y2, x3, y3] = nums as number[];
      if (command === "c") {
        addCubic(x + x1, y + y1, x + x2, y + y2, x + x3, y + y3);
      } else {
        addCubic(x1, y1, x2, y2, x3, y3);
      }
      i += 6;
      continue;
    }

    i += 1;
  }

  return points;
}

function bboxOf(points: { x: number; y: number }[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function buildStroke(): StrokePoint[] {
  const raw = flattenPath(PATH_SVG);
  const box = bboxOf(raw);
  const scale = ARTBOARD_W / 2 / box.w;
  const drawnW = box.w * scale;
  const drawnH = box.h * scale;
  const ox = (ARTBOARD_W - drawnW) / 2 - box.minX * scale;
  const oy = (ARTBOARD_H - drawnH) / 2 - box.minY * scale;

  const fitted = raw.map(p => ({
    x: p.x * scale + ox,
    y: p.y * scale + oy,
  }));

  const lengths = [0];
  for (let i = 1; i < fitted.length; i++) {
    const a = fitted[i - 1];
    const b = fitted[i];
    lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lengths[lengths.length - 1] || 1;

  const spacing = 5;
  const count = Math.max(2, Math.ceil(total / spacing));
  const samples: StrokePoint[] = [];
  let cursor = 1;
  for (let i = 0; i <= count; i++) {
    const dist = (total * i) / count;
    while (cursor < lengths.length - 1 && lengths[cursor] < dist) cursor += 1;
    const a = fitted[cursor - 1];
    const b = fitted[cursor];
    const span = lengths[cursor] - lengths[cursor - 1] || 1;
    const u = (dist - lengths[cursor - 1]) / span;
    samples.push({
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      nx: 0,
      ny: 0,
      t: dist / total,
    });
  }

  for (let i = 0; i < samples.length; i++) {
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    samples[i].nx = -ty;
    samples[i].ny = tx;
  }

  return samples;
}
