import { useCallback, useEffect, useRef, useState } from "react";

const STEP_ANGLE = 2;
const ARC_RADIUS = 320;
const CANVAS_HEIGHT = 120;
const SPRING_K = 120;
const SPRING_C = 20;
const SETTLE_POS = 0.002;
const SETTLE_VEL = 0.02;
const PX_PER_UNIT = (ARC_RADIUS * STEP_ANGLE * Math.PI) / 180;

type WeightArcSliderProps = {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  fallback?: number;
  unit?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function rubberBand(projected: number, min: number, max: number) {
  if (projected < min) {
    return min - Math.log(min - projected + 1) * 2;
  }
  if (projected > max) {
    return max + Math.log(projected - max + 1) * 2;
  }
  return projected;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function readColor(
  styles: CSSStyleDeclaration,
  name: string,
  fallback: string
) {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function WeightArcSlider({
  value,
  defaultValue,
  onChange,
  min = 30,
  max = 150,
  fallback = 60,
  unit = "kg",
}: WeightArcSliderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualRef = useRef(0);
  const velocityRef = useRef(0);
  const targetRef = useRef(0);
  const draggingRef = useRef(false);
  const dragStartValueRef = useRef(0);
  const dragStartXRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const displayRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const snapToRef = useRef<(next: number, animate: boolean) => void>(
    () => undefined
  );

  const resolvedFallback = clamp(fallback, min, max);
  const initial = clamp(
    value ?? defaultValue ?? resolvedFallback,
    min,
    max
  );

  const [display, setDisplay] = useState(initial);

  onChangeRef.current = onChange;
  valueRef.current = value;
  displayRef.current = display;

  const emit = useCallback((next: number) => {
    if (next === displayRef.current) return;
    displayRef.current = next;
    setDisplay(next);
    onChangeRef.current?.(next);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(8);
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth === 0 || cssHeight === 0) return;

    const pixelWidth = Math.round(cssWidth * dpr);
    const pixelHeight = Math.round(cssHeight * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const styles = getComputedStyle(root);
    const secondary = readColor(styles, "--ws-tick", "#a1a1aa");
    const brand = readColor(styles, "--ws-brand", "#9631fe");
    const needle = readColor(styles, "--ws-needle", "#f4f4f5");
    const font = styles.fontFamily || "sans-serif";

    const centerX = cssWidth / 2;
    const arcCenterY = cssHeight + ARC_RADIUS - 80;
    const visual = visualRef.current;

    ctx.lineCap = "round";
    ctx.lineWidth = 1;
    ctx.strokeStyle = secondary;

    for (let tick = min; tick <= max; tick++) {
      const angleOffset = (tick - visual) * STEP_ANGLE;
      const angle = toRad(-90 + angleOffset);
      const isMajor = tick % 5 === 0;
      const tickLength = isMajor ? 18 : 10;
      const innerR = ARC_RADIUS - tickLength;
      const ox = centerX + ARC_RADIUS * Math.cos(angle);
      const oy = arcCenterY + ARC_RADIUS * Math.sin(angle);

      if (ox < -40 || ox > cssWidth + 40) continue;

      const ix = centerX + innerR * Math.cos(angle);
      const iy = arcCenterY + innerR * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ix, iy);
      ctx.stroke();

      if (isMajor) {
        const labelR = innerR - 14;
        const lx = centerX + labelR * Math.cos(angle);
        const ly = arcCenterY + labelR * Math.sin(angle);
        ctx.font = `600 10px ${font}`;
        ctx.fillStyle = secondary;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(tick), lx, ly);
      }
    }

    const triY = arcCenterY - ARC_RADIUS - 8;
    const arcTopY = arcCenterY - ARC_RADIUS;

    ctx.beginPath();
    ctx.moveTo(centerX, triY);
    ctx.lineTo(centerX - 5, triY - 10);
    ctx.lineTo(centerX + 5, triY - 10);
    ctx.closePath();
    ctx.fillStyle = brand;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(centerX, triY + 30);
    ctx.lineTo(centerX, arcTopY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = needle;
    ctx.stroke();
  }, [max, min]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    lastTimeRef.current = 0;
  }, []);

  const loop = useCallback(
    (now: number) => {
      const last = lastTimeRef.current || now;
      const dt = Math.min((now - last) / 1000, 1 / 30);
      lastTimeRef.current = now;

      if (!draggingRef.current) {
        const disp = visualRef.current - targetRef.current;
        const acc = -SPRING_K * disp - SPRING_C * velocityRef.current;
        velocityRef.current += acc * dt;
        visualRef.current += velocityRef.current * dt;

        if (
          Math.abs(disp) < SETTLE_POS &&
          Math.abs(velocityRef.current) < SETTLE_VEL
        ) {
          visualRef.current = targetRef.current;
          velocityRef.current = 0;
        }
      }

      emit(clamp(Math.round(visualRef.current), min, max));
      draw();

      const settled =
        !draggingRef.current &&
        visualRef.current === targetRef.current &&
        velocityRef.current === 0;

      if (settled) {
        rafRef.current = 0;
        lastTimeRef.current = 0;
        return;
      }

      rafRef.current = requestAnimationFrame(loop);
    },
    [draw, emit, max, min]
  );

  const startLoop = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const snapTo = useCallback(
    (next: number, animate: boolean) => {
      const clamped = clamp(next, min, max);
      targetRef.current = clamped;
      if (!animate || prefersReducedMotion()) {
        visualRef.current = clamped;
        velocityRef.current = 0;
        emit(clamped);
        draw();
        return;
      }
      startLoop();
    },
    [draw, emit, max, min, startLoop]
  );

  snapToRef.current = snapTo;

  useEffect(() => {
    const start = clamp(
      valueRef.current ?? defaultValue ?? resolvedFallback,
      min,
      max
    );
    visualRef.current = start;
    targetRef.current = start;
    emit(start);
    draw();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);

    const themeRoot = document.documentElement;
    const mo = new MutationObserver(() => draw());
    mo.observe(themeRoot, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      ro.disconnect();
      mo.disconnect();
      stopLoop();
    };
    // Mount-only: live value/range updates go through the controlled-value effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (draggingRef.current) return;
      const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
      visualRef.current = rubberBand(
        visualRef.current - delta / PX_PER_UNIT,
        min,
        max
      );
      snapToRef.current(
        Math.round(visualRef.current),
        !prefersReducedMotion()
      );
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [max, min]);

  useEffect(() => {
    if (value == null) return;
    const clamped = clamp(
      min <= value && value <= max ? value : resolvedFallback,
      min,
      max
    );
    if (draggingRef.current) return;
    if (clamped === targetRef.current && clamped === displayRef.current) return;
    snapTo(clamped, true);
  }, [max, min, resolvedFallback, snapTo, value]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = event.currentTarget;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* some synthetic events cannot capture */
    }
    pointerIdRef.current = event.pointerId;
    draggingRef.current = true;
    velocityRef.current = 0;
    dragStartValueRef.current = visualRef.current;
    dragStartXRef.current = event.clientX;
    stopLoop();
    canvas.classList.add("is-dragging");
    rootRef.current
      ?.querySelector<HTMLElement>(".ws-arc-wrap")
      ?.focus({ preventScroll: true });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || event.pointerId !== pointerIdRef.current) {
      return;
    }
    const projected = rubberBand(
      dragStartValueRef.current -
        (event.clientX - dragStartXRef.current) / PX_PER_UNIT,
      min,
      max
    );
    visualRef.current = projected;
    emit(clamp(Math.round(projected), min, max));
    draw();
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || event.pointerId !== pointerIdRef.current) {
      return;
    }
    draggingRef.current = false;
    pointerIdRef.current = null;
    event.currentTarget.classList.remove("is-dragging");
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    snapTo(Math.round(visualRef.current), true);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 5 : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      snapTo(displayRef.current - step, true);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      snapTo(displayRef.current + step, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      snapTo(min, true);
    } else if (event.key === "End") {
      event.preventDefault();
      snapTo(max, true);
    }
  };

  return (
    <div ref={rootRef} className="ws-slider">
      <div className="ws-readout" aria-hidden="true">
        <span className="ws-value">{display}</span>
        <span className="ws-unit">{unit}</span>
      </div>
      <div
        className="ws-arc-wrap"
        role="slider"
        tabIndex={0}
        aria-label="体重"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={display}
        aria-valuetext={`${display}${unit}`}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
      >
        <canvas
          ref={canvasRef}
          className="ws-arc"
          style={{ height: CANVAS_HEIGHT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>
    </div>
  );
}

export default function WeightDemo() {
  const [weight, setWeight] = useState(60);

  return (
    <div className="ws-demo">
      <h1 className="ws-title">你的体重</h1>
      <WeightArcSlider value={weight} onChange={setWeight} />
      <p className="ws-hint">拖动弧形刻度 · 滚轮或方向键微调</p>
    </div>
  );
}
