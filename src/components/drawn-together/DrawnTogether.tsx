import { useEffect, useRef } from "react";
import { colorAt, frameAt, localFade, rgba, strokeWidthAt } from "./anim";
import { ARTBOARD_H, ARTBOARD_W, buildStroke, type StrokePoint } from "./path";

const stroke = buildStroke();

function rangeOf(start: number, end: number) {
  const lo = Math.min(1, Math.max(0, start));
  const hi = Math.min(1, Math.max(lo, end));
  if (hi - lo < 0.001) return null;
  const i0 = Math.max(0, Math.floor(lo * (stroke.length - 1)));
  const i1 = Math.min(stroke.length - 1, Math.ceil(hi * (stroke.length - 1)));
  return { i0, i1, lo, hi };
}

function drawQuad(
  ctx: CanvasRenderingContext2D,
  a: StrokePoint,
  b: StrokePoint,
  wa: number,
  wb: number
) {
  ctx.beginPath();
  ctx.moveTo(a.x + a.nx * wa, a.y + a.ny * wa);
  ctx.lineTo(a.x - a.nx * wa, a.y - a.ny * wa);
  ctx.lineTo(b.x - b.nx * wb, b.y - b.ny * wb);
  ctx.lineTo(b.x + b.nx * wb, b.y + b.ny * wb);
  ctx.closePath();
  ctx.fill();
}

function drawStrip(
  ctx: CanvasRenderingContext2D,
  a: StrokePoint,
  b: StrokePoint,
  a0: number,
  a1: number,
  b0: number,
  b1: number
) {
  ctx.beginPath();
  ctx.moveTo(a.x + a.nx * a0, a.y + a.ny * a0);
  ctx.lineTo(a.x + a.nx * a1, a.y + a.ny * a1);
  ctx.lineTo(b.x + b.nx * b1, b.y + b.ny * b1);
  ctx.lineTo(b.x + b.nx * b0, b.y + b.ny * b0);
  ctx.closePath();
  ctx.fill();
}

function drawCap(
  ctx: CanvasRenderingContext2D,
  p: StrokePoint,
  radius: number
) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function paint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reduceMotion: boolean
) {
  const state = frameAt(time, reduceMotion);
  const visible = rangeOf(state.pathStart, state.pathEnd);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  if (!visible) return;

  const fit = Math.min(width / ARTBOARD_W, height / ARTBOARD_H);
  const view = fit * 0.92;
  const ox = (width - ARTBOARD_W * view) / 2;
  const oy = (height - ARTBOARD_H * view) / 2;
  const span = visible.hi - visible.lo;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(state.zoom, state.zoom);
  ctx.translate(-width / 2, -height / 2);
  ctx.translate(ox, oy);
  ctx.scale(view, view);

  const glow = 0.35 + state.glowIntensity;
  const layers = [
    { kind: "fill", scale: 2.8, alpha: 0.07 * glow },
    { kind: "fill", scale: 1.7, alpha: 0.12 * glow },
    { kind: "fill", scale: 1.12, alpha: 0.28 * glow },
    { kind: "body", scale: 1, alpha: 0.22 },
    { kind: "rim", inner: 0.68, outer: 1, alpha: 0.82 },
    { kind: "highlight", inner: 0.18, outer: 0.42, alpha: 0.4 },
  ] as const;

  ctx.globalCompositeOperation = "lighter";
  for (const layer of layers) {
    for (let i = visible.i0; i < visible.i1; i++) {
      const a = stroke[i];
      const b = stroke[i + 1];
      if (b.t < visible.lo || a.t > visible.hi) continue;
      const midT = (a.t + b.t) / 2;
      const ctxT = (midT - visible.lo) / span;
      const fade = localFade(ctxT, state.vanish);
      if (fade > 0.97) continue;
      const wa = strokeWidthAt(a.t, state.strokeProgress) * 0.5;
      const wb = strokeWidthAt(b.t, state.strokeProgress) * 0.5;
      const rgb = colorAt(midT, state.colorShift);
      const alpha = layer.alpha * (1 - fade);
      if (layer.kind === "fill" || layer.kind === "body") {
        ctx.fillStyle = rgba(rgb, alpha);
        drawQuad(ctx, a, b, wa * layer.scale, wb * layer.scale);
        continue;
      }
      ctx.fillStyle =
        layer.kind === "highlight" ? `rgba(255,255,255,${alpha})` : rgba(rgb, alpha);
      drawStrip(
        ctx,
        a,
        b,
        wa * layer.inner,
        wa * layer.outer,
        wb * layer.inner,
        wb * layer.outer
      );
      if (layer.kind === "rim") {
        drawStrip(
          ctx,
          a,
          b,
          -wa * layer.outer,
          -wa * layer.inner,
          -wb * layer.outer,
          -wb * layer.inner
        );
      }
    }

    const ends = [
      { p: stroke[visible.i1], fade: localFade(1, state.vanish) },
      { p: stroke[visible.i0], fade: localFade(0, state.vanish) },
    ];
    for (const { p, fade } of ends) {
      if (fade > 0.97) continue;
      const rgb = colorAt(p.t, state.colorShift);
      const radius = strokeWidthAt(p.t, state.strokeProgress) * 0.5;
      const alpha = layer.alpha * (1 - fade);
      const scale = "scale" in layer ? layer.scale : layer.outer;
      ctx.fillStyle =
        layer.kind === "highlight"
          ? `rgba(255,255,255,${alpha})`
          : rgba(rgb, alpha);
      drawCap(ctx, p, radius * scale);
    }
  }

  ctx.restore();
}

export default function DrawnTogether() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      if (!running) return;
      try {
        paint(
          ctx,
          canvas.clientWidth,
          canvas.clientHeight,
          now - started,
          reduceMotion
        );
      } catch (error) {
        console.error("[drawn-together]", error);
      }
      if (!reduceMotion) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="dt-root">
      <canvas ref={canvasRef} className="dt-canvas" />
    </div>
  );
}
