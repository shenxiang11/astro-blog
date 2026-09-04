import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const TRACK_HEIGHT = 7;
const SLIDER_HEIGHT = 94;
const TRACK_Y = 36;
const LOWER_BUBBLE_Y = 14;
const UPPER_BUBBLE_Y = 74;
const ARROW_WIDTH = 16;
const ARROW_HEIGHT = 8;

export type DualRangeSliderProps = {
  lowerValue?: number;
  upperValue?: number;
  defaultLower?: number;
  defaultUpper?: number;
  onChange?: (lower: number, upper: number) => void;
  onEditingEnded?: (lower: number, upper: number) => void;
  min?: number;
  max?: number;
  minGap?: number;
  valueText?: (value: number) => string;
  ariaLabelLower?: string;
  ariaLabelUpper?: string;
};

type Range = { lower: number; upper: number };

type DragSession = {
  handle: "lower" | "upper";
  startX: number;
  startValue: number;
  otherValue: number;
  pointerId: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function normalizeRange(
  lower: number,
  upper: number,
  min: number,
  max: number
): Range {
  const a = clamp(lower, min, max);
  const b = clamp(upper, min, max);
  return { lower: Math.min(a, b), upper: Math.max(a, b) };
}

function bubblePath(width: number, height: number, arrowOnTop: boolean) {
  if (width <= 0 || height <= 0) return "";

  const bodyTop = arrowOnTop ? ARROW_HEIGHT : 0;
  const bodyBottom = arrowOnTop ? height : height - ARROW_HEIGHT;
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
  const radius = bodyHeight / 2;
  const midX = width / 2;
  const arrowHalf = Math.min(
    ARROW_WIDTH / 2,
    Math.max((width - 2 * radius) / 2, 1)
  );

  if (arrowOnTop) {
    return [
      `M ${midX} 0`,
      `L ${midX + arrowHalf} ${bodyTop}`,
      `L ${width - radius} ${bodyTop}`,
      `A ${radius} ${radius} 0 0 1 ${width - radius} ${bodyBottom}`,
      `L ${radius} ${bodyBottom}`,
      `A ${radius} ${radius} 0 0 1 ${radius} ${bodyTop}`,
      `L ${midX - arrowHalf} ${bodyTop}`,
      "Z",
    ].join(" ");
  }

  return [
    `M ${radius} ${bodyTop}`,
    `L ${width - radius} ${bodyTop}`,
    `A ${radius} ${radius} 0 0 1 ${width - radius} ${bodyBottom}`,
    `L ${midX + arrowHalf} ${bodyBottom}`,
    `L ${midX} ${height}`,
    `L ${midX - arrowHalf} ${bodyBottom}`,
    `L ${radius} ${bodyBottom}`,
    `A ${radius} ${radius} 0 0 1 ${radius} ${bodyTop}`,
    "Z",
  ].join(" ");
}

function applyDraggedValue(
  draggedValue: number,
  fixedValue: number,
  draggingLower: boolean,
  min: number,
  max: number,
  gap: number
): Range {
  if (gap === 0) {
    return {
      lower: Math.min(draggedValue, fixedValue),
      upper: Math.max(draggedValue, fixedValue),
    };
  }

  if (draggingLower) {
    if (draggedValue <= fixedValue - gap) {
      return { lower: draggedValue, upper: fixedValue };
    }
    if (fixedValue + gap <= max) {
      return {
        lower: fixedValue,
        upper: Math.max(draggedValue, fixedValue + gap),
      };
    }
    return { lower: Math.max(min, fixedValue - gap), upper: fixedValue };
  }

  if (draggedValue >= fixedValue + gap) {
    return { lower: fixedValue, upper: draggedValue };
  }
  if (fixedValue - gap >= min) {
    return {
      lower: Math.min(draggedValue, fixedValue - gap),
      upper: fixedValue,
    };
  }
  return { lower: fixedValue, upper: Math.min(max, fixedValue + gap) };
}

function RangeSliderBubble({
  text,
  arrowOnTop,
  handle,
  left,
  top,
  dragging,
  label,
  min,
  max,
  value,
  valueText,
  onKeyDown,
}: {
  text: string;
  arrowOnTop: boolean;
  handle: "lower" | "upper";
  left: number;
  top: number;
  dragging: boolean;
  label: string;
  min: number;
  max: number;
  value: number;
  valueText: string;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ w: 64, h: 38 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const next = { w: el.offsetWidth, h: el.offsetHeight };
      setSize(prev =>
        prev.w === next.w && prev.h === next.h ? prev : next
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  const style: CSSProperties = {
    left,
    top,
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`drs-bubble${arrowOnTop ? " is-arrow-top" : " is-arrow-bottom"}${
        dragging ? " is-dragging" : ""
      }`}
      style={style}
      data-handle={handle}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
    >
      <svg
        className="drs-bubble-svg"
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        aria-hidden="true"
      >
        <path d={bubblePath(size.w, size.h, arrowOnTop)} />
      </svg>
      <span className="drs-bubble-text">{text}</span>
    </button>
  );
}

export function DualRangeSlider({
  lowerValue,
  upperValue,
  defaultLower,
  defaultUpper,
  onChange,
  onEditingEnded,
  min = 18,
  max = 60,
  minGap = 1,
  valueText = String,
  ariaLabelLower = "最小值",
  ariaLabelUpper = "最大值",
}: DualRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range>({
    lower: defaultLower ?? min,
    upper: defaultUpper ?? max,
  });
  const onChangeRef = useRef(onChange);
  const onEndedRef = useRef(onEditingEnded);
  const dragRef = useRef<DragSession | null>(null);
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [range, setRange] = useState<Range>(() =>
    normalizeRange(defaultLower ?? min, defaultUpper ?? max, min, max)
  );
  const [dragging, setDragging] = useState<"lower" | "upper" | null>(null);

  onChangeRef.current = onChange;
  onEndedRef.current = onEditingEnded;
  rangeRef.current = range;

  const span = max - min;
  const gap = Math.min(Math.max(0, minGap), Math.max(span, 0));

  const commit = useCallback(
    (next: Range, ended: boolean) => {
      const prev = rangeRef.current;
      if (prev.lower === next.lower && prev.upper === next.upper) {
        if (ended) onEndedRef.current?.(next.lower, next.upper);
        return;
      }
      rangeRef.current = next;
      setRange(next);
      onChangeRef.current?.(next.lower, next.upper);
      if (
        typeof navigator !== "undefined" &&
        navigator.vibrate &&
        (prev.lower !== next.lower || prev.upper !== next.upper)
      ) {
        navigator.vibrate(8);
      }
      if (ended) onEndedRef.current?.(next.lower, next.upper);
    },
    []
  );

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const update = () => {
      trackWidthRef.current = el.clientWidth;
      setTrackWidth(el.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (lowerValue == null || upperValue == null) return;
    if (dragRef.current) return;
    const next = normalizeRange(lowerValue, upperValue, min, max);
    if (
      next.lower === rangeRef.current.lower &&
      next.upper === rangeRef.current.upper
    ) {
      return;
    }
    rangeRef.current = next;
    setRange(next);
  }, [lowerValue, upperValue, min, max]);

  useEffect(() => {
    const root = trackRef.current;
    if (!root) return;

    const valueFromTranslation = (start: number, translationX: number) => {
      const width = trackWidthRef.current;
      if (width <= 0 || span <= 0) return start;
      const delta = Math.round((translationX / width) * span);
      return clamp(start + delta, min, max);
    };

    const pointerIdOf = (event: PointerEvent | MouseEvent) =>
      "pointerId" in event ? event.pointerId : 1;

    const onDown = (event: PointerEvent | MouseEvent) => {
      if ("button" in event && event.button !== 0) return;
      if (dragRef.current) return;

      const handle = (event.target as Element | null)
        ?.closest("[data-handle]")
        ?.getAttribute("data-handle");
      if (handle !== "lower" && handle !== "upper") return;

      event.preventDefault();
      const current = rangeRef.current;
      dragRef.current = {
        handle,
        startX: event.clientX,
        startValue: handle === "lower" ? current.lower : current.upper,
        otherValue: handle === "lower" ? current.upper : current.lower,
        pointerId: pointerIdOf(event),
      };
      setDragging(handle);

      const target = event.currentTarget as HTMLElement;
      if ("pointerId" in event) {
        try {
          target.setPointerCapture?.(event.pointerId);
        } catch {
          /* some synthetic events cannot capture */
        }
      }
    };

    const onMove = (event: PointerEvent | MouseEvent) => {
      const session = dragRef.current;
      if (!session || pointerIdOf(event) !== session.pointerId) return;
      const nextValue = valueFromTranslation(
        session.startValue,
        event.clientX - session.startX
      );
      commit(
        applyDraggedValue(
          nextValue,
          session.otherValue,
          session.handle === "lower",
          min,
          max,
          gap
        ),
        false
      );
    };

    const onUp = (event: PointerEvent | MouseEvent) => {
      const session = dragRef.current;
      if (!session || pointerIdOf(event) !== session.pointerId) return;
      dragRef.current = null;
      setDragging(null);
      onEndedRef.current?.(rangeRef.current.lower, rangeRef.current.upper);
    };

    root.addEventListener("pointerdown", onDown);
    root.addEventListener("mousedown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("mousedown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [commit, gap, max, min, span]);

  const xFor = (value: number) => {
    if (span <= 0 || trackWidth <= 0) return 0;
    const progress = (value - min) / span;
    return clamp(progress * trackWidth, 0, trackWidth);
  };

  const nudge = (handle: "lower" | "upper", delta: number) => {
    const current = rangeRef.current;
    const dragged =
      handle === "lower" ? current.lower + delta : current.upper + delta;
    commit(
      applyDraggedValue(
        clamp(dragged, min, max),
        handle === "lower" ? current.upper : current.lower,
        handle === "lower",
        min,
        max,
        gap
      ),
      true
    );
  };

  const onKeyDown =
    (handle: "lower" | "upper") =>
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 5 : 1;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        nudge(handle, -step);
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        nudge(handle, step);
      } else if (event.key === "Home") {
        event.preventDefault();
        const current = rangeRef.current;
        nudge(
          handle,
          handle === "lower" ? min - current.lower : min - current.upper
        );
      } else if (event.key === "End") {
        event.preventDefault();
        const current = rangeRef.current;
        nudge(
          handle,
          handle === "lower" ? max - current.lower : max - current.upper
        );
      }
    };

  const lowerX = xFor(range.lower);
  const upperX = xFor(range.upper);
  const selectedWidth = Math.max(upperX - lowerX, TRACK_HEIGHT);

  return (
    <div className="drs-slider">
      <div
        ref={trackRef}
        className="drs-body"
        style={{ height: SLIDER_HEIGHT }}
      >
        <div
          className="drs-track"
          style={{ top: TRACK_Y, height: TRACK_HEIGHT }}
        />
        <div
          className="drs-selected"
          style={{
            top: TRACK_Y,
            left: lowerX,
            width: selectedWidth,
            height: TRACK_HEIGHT,
          }}
        />
        <RangeSliderBubble
          text={valueText(range.lower)}
          arrowOnTop={false}
          handle="lower"
          left={lowerX}
          top={LOWER_BUBBLE_Y}
          dragging={dragging === "lower"}
          label={ariaLabelLower}
          min={min}
          max={max}
          value={range.lower}
          valueText={valueText(range.lower)}
          onKeyDown={onKeyDown("lower")}
        />
        <RangeSliderBubble
          text={valueText(range.upper)}
          arrowOnTop
          handle="upper"
          left={upperX}
          top={UPPER_BUBBLE_Y}
          dragging={dragging === "upper"}
          label={ariaLabelUpper}
          min={min}
          max={max}
          value={range.upper}
          valueText={valueText(range.upper)}
          onKeyDown={onKeyDown("upper")}
        />
      </div>
    </div>
  );
}

type DemoRow = {
  title: string;
  noun: string;
  min: number;
  max: number;
  lower: number;
  upper: number;
  suffix: string;
};

const ROWS: DemoRow[] = [
  {
    title: "年龄范围",
    noun: "年龄",
    min: 18,
    max: 80,
    lower: 18,
    upper: 26,
    suffix: "岁",
  },
  {
    title: "身高偏好",
    noun: "身高",
    min: 140,
    max: 220,
    lower: 160,
    upper: 188,
    suffix: "cm",
  },
  {
    title: "体重偏好",
    noun: "体重",
    min: 30,
    max: 150,
    lower: 45,
    upper: 80,
    suffix: "kg",
  },
];

function DemoField({ row }: { row: DemoRow }) {
  const [lower, setLower] = useState(row.lower);
  const [upper, setUpper] = useState(row.upper);

  return (
    <section className="drs-field">
      <div className="drs-field-head">
        <h2 className="drs-field-title">{row.title}</h2>
        <p className="drs-field-readout" aria-live="polite">
          {`${lower}${row.suffix} – ${upper}${row.suffix}`}
        </p>
      </div>
      <DualRangeSlider
        lowerValue={lower}
        upperValue={upper}
        min={row.min}
        max={row.max}
        valueText={value => `${value}${row.suffix}`}
        ariaLabelLower={`最小${row.noun}`}
        ariaLabelUpper={`最大${row.noun}`}
        onChange={(nextLower, nextUpper) => {
          setLower(nextLower);
          setUpper(nextUpper);
        }}
      />
    </section>
  );
}

export default function DualRangeDemo() {
  return (
    <div className="drs-demo">
      <h1 className="drs-title">选出一个范围</h1>
      {ROWS.map(row => (
        <DemoField key={row.title} row={row} />
      ))}
      <p className="drs-hint">拖动两端气泡 · 交叉会换边 · 方向键微调</p>
    </div>
  );
}
