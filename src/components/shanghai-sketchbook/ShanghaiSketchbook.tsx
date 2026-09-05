import { useCallback, useEffect, useRef, useState } from "react";
import botanyLeft from "@/assets/shanghai/botany-left.png?url";
import botanyRight from "@/assets/shanghai/botany-right.png?url";
import { PLATES, type Plate } from "./plates";
import PaperCurl, { type CurlDir } from "./PaperCurl";
import { easeInOutCubic } from "./ease";

const ZOOM_STEPS = [1, 1.12, 1.28] as const;
const LOUPE_MAG = 2.6;
const TURN_MS = 780;
const SETTLE_T = 0.8;
const INTRO_DELAY_MS = 220;

type FlipOpts = {
  keepHint?: boolean;
  ms?: number;
  ease?: "linear" | "cubic";
};

type Turn = CurlDir;

type TurnState = {
  dir: Turn;
  from: number;
  to: number;
  t: number;
};

function wrapIndex(index: number, delta: number) {
  const length = PLATES.length;
  return (index + delta + length) % length;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function loupeRadius(bookWidth: number) {
  return Math.round(Math.max(165, Math.min(262, bookWidth * 0.235))) / 2;
}

function riffleDurations(steps: number) {
  if (steps <= 1) return [260];
  return Array.from({ length: steps }, (_, index) => {
    const bell = Math.sin(Math.PI * (index / (steps - 1)));
    return 260 - 190 * bell;
  });
}

export default function ShanghaiSketchbook() {
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState<TurnState | null>(null);
  const [zoomStep, setZoomStep] = useState(0);
  const [loupeOn, setLoupeOn] = useState(true);
  const [loupe, setLoupe] = useState({ x: 0, y: 0 });
  const [bookSize, setBookSize] = useState({ w: 0, h: 0 });
  const [hintGone, setHintGone] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 6 });
  const [introOn, setIntroOn] = useState(false);
  const [introRush, setIntroRush] = useState(false);

  const bookRef = useRef<HTMLDivElement>(null);
  const loupeReady = bookSize.w > 0;
  const turnRef = useRef<TurnState | null>(null);
  const indexRef = useRef(index);
  const introRef = useRef<"pending" | "running" | "done">("pending");
  const introLeftRef = useRef(0);
  const introDursRef = useRef<number[]>([]);
  const introStepRef = useRef(0);
  const flipRef = useRef<(direction: Turn, opts?: FlipOpts) => void>(() => {});
  const afterSettleRef = useRef<(committed: boolean) => void>(() => {});
  const animRef = useRef(0);
  indexRef.current = index;
  const dragRef = useRef<{
    kind: "loupe" | "page" | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    lastT: number;
    lastAt: number;
    velocity: number;
  }>({
    kind: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    lastT: 0,
    lastAt: 0,
    velocity: 0,
  });

  const current = PLATES[index];
  const zoom = ZOOM_STEPS[zoomStep];
  const turning = Boolean(turn);
  const visiblePlate = turn && turn.t > 0.5 ? PLATES[turn.to] : current;
  const spreadSrc =
    turn && turn.t >= SETTLE_T ? PLATES[turn.to].src : current.src;
  const turnFade =
    turn && turn.t >= SETTLE_T
      ? Math.max(0, 1 - (turn.t - SETTLE_T) / (1 - SETTLE_T))
      : 1;

  const dismissHint = useCallback(() => {
    setHintGone(true);
  }, []);

  const stopIntro = useCallback(() => {
    introRef.current = "done";
    introLeftRef.current = 0;
    setIntroOn(false);
    setIntroRush(false);
  }, []);

  const writeTurn = useCallback((next: TurnState | null) => {
    turnRef.current = next;
    setTurn(next);
  }, []);

  const settleTurn = useCallback(
    (committed: boolean) => {
      const active = turnRef.current;
      if (committed && active) {
        indexRef.current = active.to;
        setIndex(active.to);
      }
      writeTurn(null);
      afterSettleRef.current(committed);
    },
    [writeTurn]
  );

  const animateTurn = useCallback(
    (target: 0 | 1, duration = TURN_MS, ease: FlipOpts["ease"] = "cubic") => {
      cancelAnimationFrame(animRef.current);
      const startValue = turnRef.current?.t ?? 0;
      const started = performance.now();
      const easeFn = ease === "linear" ? (value: number) => value : easeInOutCubic;

      const tick = (now: number) => {
        const active = turnRef.current;
        if (!active) return;
        const progress = Math.min(1, (now - started) / duration);
        const t = startValue + (target - startValue) * easeFn(progress);
        writeTurn({ ...active, t: progress < 1 ? t : target });
        if (progress < 1) {
          animRef.current = requestAnimationFrame(tick);
          return;
        }
        if (introRef.current === "running") {
          settleTurn(target === 1);
          return;
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => settleTurn(target === 1));
        });
      };

      animRef.current = requestAnimationFrame(tick);
    },
    [settleTurn, writeTurn]
  );

  const beginTurn = useCallback(
    (direction: Turn, t = 0, opts?: FlipOpts) => {
      if (turnRef.current) return;
      if (!opts?.keepHint) {
        stopIntro();
        dismissHint();
      }
      const from = indexRef.current;
      const to = wrapIndex(from, direction === "next" ? 1 : -1);
      if (prefersReducedMotion()) {
        indexRef.current = to;
        setIndex(to);
        return;
      }
      writeTurn({ dir: direction, from, to, t });
    },
    [dismissHint, stopIntro, writeTurn]
  );

  const flip = useCallback(
    (direction: Turn, opts?: FlipOpts) => {
      if (!opts?.keepHint) stopIntro();
      if (turnRef.current) return;
      beginTurn(direction, 0, opts);
      requestAnimationFrame(() =>
        animateTurn(1, opts?.ms ?? TURN_MS, opts?.ease)
      );
    },
    [animateTurn, beginTurn, stopIntro]
  );
  flipRef.current = flip;
  afterSettleRef.current = () => {
    if (introRef.current !== "running") return;
    introLeftRef.current -= 1;
    introStepRef.current += 1;
    if (introLeftRef.current <= 0) {
      introRef.current = "done";
      setIntroOn(false);
      setIntroRush(false);
      return;
    }
    const ms = introDursRef.current[introStepRef.current] ?? 160;
    setIntroRush(ms < 120);
    flipRef.current("next", { keepHint: true, ms, ease: "linear" });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") flip("next");
      if (event.key === "ArrowLeft") flip("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip]);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  useEffect(() => {
    const book = bookRef.current;
    if (!book) return;

    const prev = { w: 0, h: 0 };
    const placeRest = (width: number, height: number) => {
      setBookSize({ w: width, h: height });
      if (prev.w === 0) {
        setLoupe({ x: width * 0.78, y: height * 0.62 });
      } else if (prev.w !== width || prev.h !== height) {
        setLoupe(pos => ({
          x: (pos.x / prev.w) * width,
          y: (pos.y / prev.h) * height,
        }));
      }
      prev.w = width;
      prev.h = height;
    };

    const observe = () => {
      const width = book.clientWidth;
      const height = book.clientHeight;
      if (!width || !height) return;
      placeRest(width, height);
    };

    observe();
    const observer = new ResizeObserver(observe);
    observer.observe(book);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) {
      introRef.current = "done";
      return;
    }

    let cancelled = false;
    let timeout = 0;

    const start = () => {
      if (cancelled || introRef.current !== "pending") return;
      if (turnRef.current || dragRef.current.kind) {
        stopIntro();
        return;
      }
      const durations = riffleDurations(PLATES.length);
      introDursRef.current = durations;
      introStepRef.current = 0;
      introRef.current = "running";
      introLeftRef.current = PLATES.length;
      setIntroOn(true);
      setIntroRush(durations[0] < 120);
      flipRef.current("next", {
        keepHint: true,
        ms: durations[0],
        ease: "linear",
      });
    };

    const arm = () => {
      if (cancelled || introRef.current !== "pending") return;
      if (bookRef.current && bookRef.current.clientWidth > 0) {
        timeout = window.setTimeout(start, INTRO_DELAY_MS);
        return;
      }
      timeout = window.setTimeout(arm, 50);
    };

    PLATES.forEach(plate => {
      const image = new Image();
      image.src = plate.src;
    });
    arm();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [stopIntro]);

  const onStageMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    setTilt({
      rx: (0.5 - ny) * 7,
      ry: (nx - 0.5) * 11,
    });
  };

  const onStageLeave = () => {
    setTilt({ rx: 0, ry: 6 });
  };

  const bookPoint = (clientX: number, clientY: number) => {
    const book = bookRef.current;
    if (!book) return { x: 0.5, y: 0.5, px: 0, py: 0 };
    const rect = book.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * book.clientWidth;
    const py = ((clientY - rect.top) / rect.height) * book.clientHeight;
    return {
      x: Math.min(0.93, Math.max(0.07, px / book.clientWidth)),
      y: Math.min(0.93, Math.max(0.07, py / book.clientHeight)),
      px,
      py,
    };
  };

  const onLoupeDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    stopIntro();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "loupe",
      startX: event.clientX,
      startY: event.clientY,
      originX: loupe.x,
      originY: loupe.y,
      lastT: 0,
      lastAt: 0,
      velocity: 0,
    };
    dismissHint();
  };

  const onPageDown = (event: React.PointerEvent<HTMLDivElement>) => {
    stopIntro();
    cancelAnimationFrame(animRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "page",
      startX: event.clientX,
      startY: event.clientY,
      originX: 0,
      originY: 0,
      lastT: 0,
      lastAt: performance.now(),
      velocity: 0,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag.kind === "loupe") {
      const book = bookRef.current;
      if (!book) return;
      const radius = loupeRadius(book.clientWidth);
      const { px, py } = bookPoint(event.clientX, event.clientY);
      setLoupe({
        x: Math.min(book.clientWidth + radius * 0.55, Math.max(-radius * 0.55, px)),
        y: Math.min(book.clientHeight + radius * 0.7, Math.max(-radius * 0.45, py)),
      });
      return;
    }

    if (drag.kind === "page") {
      const book = bookRef.current;
      if (!book) return;
      const dx = event.clientX - drag.startX;
      if (!turnRef.current && Math.abs(dx) > 10) {
        beginTurn(dx < 0 ? "next" : "prev", 0);
      }
      const active = turnRef.current;
      if (!active) return;
      const raw =
        (active.dir === "next" ? -dx : dx) / (book.clientWidth * 0.62);
      const t = Math.max(0, Math.min(1, raw));
      const now = performance.now();
      drag.velocity = (t - drag.lastT) / Math.max(0.001, (now - drag.lastAt) / 1000);
      drag.lastT = t;
      drag.lastAt = now;
      writeTurn({ ...active, t });
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag.kind === "page") {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const active = turnRef.current;
      if (!active && Math.hypot(dx, dy) < 8) {
        const { x } = bookPoint(event.clientX, event.clientY);
        flip(x > 0.5 ? "next" : "prev");
      } else if (active) {
        const go = active.t > 0.42 || drag.velocity > 1.1;
        animateTurn(go ? 1 : 0);
      }
    }
    dragRef.current.kind = null;
  };

  const cycleZoom = (delta: number) => {
    setZoomStep(step => Math.min(ZOOM_STEPS.length - 1, Math.max(0, step + delta)));
    dismissHint();
  };

  return (
    <div className="sh-app">
      <section className="sh-hero" id="sketchbook">
        <div className="sh-wash" aria-hidden="true" />
        <img className="sh-botany sh-botany-l" src={botanyLeft} alt="" />
        <img className="sh-botany sh-botany-r" src={botanyRight} alt="" />

        <p className="sh-kicker">
          Software Engineer / iOS · Android · Web @ Shanghai
        </p>

        <svg className="sh-mblur" aria-hidden="true">
          <filter id="sh-mblur-1" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5 0" />
          </filter>
          <filter id="sh-mblur-2" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="11 0" />
          </filter>
        </svg>
        <div
          className={`sh-wrap${introOn ? " is-intro" : ""}${introRush ? " is-rush" : ""}`}
        >
          <button
            className="sh-arrow left"
            type="button"
            aria-label="上一页"
            onClick={() => flip("prev")}
          >
            <Chevron />
          </button>

          <div
            className="sh-stage"
            onPointerMove={onStageMove}
            onPointerLeave={onStageLeave}
          >
            <div
              className="sh-3d"
              style={
                {
                  "--rx": `${tilt.rx}deg`,
                  "--ry": `${tilt.ry}deg`,
                  "--zoom": String(zoom),
                  "--shade": turn ? Math.sin(Math.PI * turn.t).toFixed(3) : "0",
                } as React.CSSProperties
              }
            >
              <div className="sh-tilt">
                <div className="sh-cast ambient" aria-hidden="true" />
                <div className="sh-cast contact" aria-hidden="true" />
                <div className="sh-cast hair" aria-hidden="true" />
                <div
                  ref={bookRef}
                  className={`sh-book${turning ? " is-turning" : ""}`}
                  onPointerDown={onPageDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <div className="sh-spread">
                    <img
                      src={spreadSrc}
                      alt={visiblePlate.english}
                      draggable={false}
                    />
                  </div>
                  {turn && (
                    <div
                      className="sh-turn-layer"
                      style={
                        turnFade < 1 ? { opacity: turnFade } : undefined
                      }
                    >
                      <div className="sh-half left">
                        <img
                          src={
                            PLATES[turn.dir === "next" ? turn.from : turn.to].src
                          }
                          alt=""
                          draggable={false}
                        />
                        <span className="sh-leaf-shade" aria-hidden="true" />
                      </div>
                      <div className="sh-half right">
                        <img
                          src={
                            PLATES[turn.dir === "next" ? turn.to : turn.from].src
                          }
                          alt=""
                          draggable={false}
                        />
                        <span className="sh-leaf-shade" aria-hidden="true" />
                      </div>
                      <PaperCurl
                        dir={turn.dir}
                        fromSrc={PLATES[turn.from].src}
                        toSrc={PLATES[turn.to].src}
                        t={turn.t}
                        bookWidth={bookSize.w || 900}
                      />
                    </div>
                  )}
                  <span className="sh-fiber" aria-hidden="true" />
                  <span className="sh-gutter" aria-hidden="true" />
                  <span className="sh-stack sh-stack-l" aria-hidden="true" />
                  <span className="sh-stack sh-stack-r" aria-hidden="true" />
                </div>
                {loupeOn && loupeReady && (
                  <Loupe
                    plate={visiblePlate}
                    x={loupe.x}
                    y={loupe.y}
                    book={bookSize}
                    onPointerDown={onLoupeDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                  />
                )}
              </div>
            </div>
          </div>

          <button
            className="sh-arrow right"
            type="button"
            aria-label="下一页"
            onClick={() => flip("next")}
          >
            <Chevron />
          </button>
        </div>

        <h2 className="sh-caption">{visiblePlate.english}</h2>

        <div className="sh-tools" role="toolbar" aria-label="速写本工具">
          <button
            className="sh-tool"
            type="button"
            aria-label="缩小"
            onClick={() => cycleZoom(-1)}
            disabled={zoomStep === 0}
          >
            <MinusIcon />
          </button>
          <span className="sh-zoom-read">{Math.round(zoom * 100)}%</span>
          <button
            className="sh-tool"
            type="button"
            aria-label="放大"
            onClick={() => cycleZoom(1)}
            disabled={zoomStep === ZOOM_STEPS.length - 1}
          >
            <PlusIcon />
          </button>
          <span className="sh-tool-sep" />
          <button
            className={`sh-tool${loupeOn ? " is-on" : ""}`}
            type="button"
            aria-label={loupeOn ? "收起放大镜" : "打开放大镜"}
            aria-pressed={loupeOn}
            onClick={() => {
              setLoupeOn(value => !value);
              dismissHint();
            }}
          >
            <SearchIcon />
          </button>
        </div>

        <p className={`sh-hint${hintGone ? " is-gone" : ""}`}>
          拖动纸页翻页 · 拖动放大镜细看
        </p>

        <a className="sh-down" href="#sh-about" aria-label="向下看简介">
          <svg viewBox="0 0 18 20" width="16" height="18" fill="none">
            <polyline
              points="3,3 9,8 15,3"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="3,10 9,15 15,10"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </section>

      <section className="sh-about" id="sh-about">
        <p className="sh-section-label">About</p>
        <p className="sh-bio">
          这本速写看着上海。江面、石库门、法租界的梧桐，寺檐后面的玻璃塔，还有青浦的水巷。
          用墨线把轮廓留下来，再铺一点点水色——城市就会慢下来。
        </p>
      </section>

      <section className="sh-plates" id="sh-plates">
        <p className="sh-section-label">Plates</p>
        <ol className="sh-plate-list">
          {PLATES.map((plate, plateIndex) => (
            <li key={plate.id}>
              <button
                type="button"
                className={`sh-plate${plateIndex === (turn ? turn.to : index) ? " is-current" : ""}`}
                onClick={() => {
                  if (plateIndex === index || turnRef.current) return;
                  dismissHint();
                  if (plateIndex === wrapIndex(index, 1)) {
                    flip("next");
                    return;
                  }
                  if (plateIndex === wrapIndex(index, -1)) {
                    flip("prev");
                    return;
                  }
                  indexRef.current = plateIndex;
                  setIndex(plateIndex);
                }}
              >
                <span className="n">{String(plateIndex + 1).padStart(2, "0")}</span>
                <span className="t">{plate.english}</span>
                <span className="p">{plate.place}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <footer className="sh-foot">Shanghai · Sketchbook</footer>
    </div>
  );
}

function Loupe({
  plate,
  x,
  y,
  book,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  plate: Plate;
  x: number;
  y: number;
  book: { w: number; h: number };
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
}) {
  const size = loupeRadius(book.w) * 2;
  const pad = size * 0.058;
  const inner = size - pad * 2;

  return (
    <div
      className="sh-loupe"
      role="slider"
      aria-label="放大镜"
      aria-valuetext="拖动查看细节"
      style={{
        width: size,
        height: size,
        transform: `translate3d(${x - size / 2}px, ${y - size / 2}px, 0)`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="sh-loupe-grip" aria-hidden="true" />
      <span className="sh-loupe-ring">
        <span className="sh-loupe-lens">
          <img
            src={plate.src}
            alt=""
            draggable={false}
            style={{
              width: book.w * LOUPE_MAG,
              height: book.h * LOUPE_MAG,
              left: -(x * LOUPE_MAG - inner / 2),
              top: -(y * LOUPE_MAG - inner / 2),
            }}
          />
        </span>
      </span>
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 14 44" width="14" height="44" fill="none" aria-hidden="true">
      <polyline
        points="11,3 3,22 11,41"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
