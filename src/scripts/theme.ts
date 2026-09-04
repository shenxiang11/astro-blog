const THEME_KEY = "theme";
const LIGHT = "light";
const DARK = "dark";
const TRANSITION_MS = 500;

function getPreferredTheme(): string {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK
    : LIGHT;
}

let themeValue: string =
  (window as unknown as { __theme?: { value: string } }).__theme?.value ??
  getPreferredTheme();

let pointerX = innerWidth / 2;
let pointerY = innerHeight / 2;

function isS65Demo(): boolean {
  return /(?:^|\/)demos\/s65\/?$/.test(location.pathname);
}

function persist(): void {
  localStorage.setItem(THEME_KEY, themeValue);
  reflect();
}

function reflect(): void {
  const locked = isS65Demo();
  const shown = locked ? DARK : themeValue;
  const root = document.documentElement;
  root.setAttribute("data-theme", shown);
  root.classList.toggle("dark", shown === DARK);
  root.classList.toggle("theme-locked", locked);
  document.querySelector("#theme-btn")?.setAttribute("aria-label", themeValue);

  const bg = window.getComputedStyle(document.body).backgroundColor;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bg);
}

/** Viewport-relative origin, as % of the view-transition snapshot (viewport). */
function circleOrigin(x: number, y: number): { xPct: number; yPct: number } {
  const vv = window.visualViewport;
  const left = vv?.offsetLeft ?? 0;
  const top = vv?.offsetTop ?? 0;
  const width = vv?.width || innerWidth;
  const height = vv?.height || innerHeight;
  return {
    xPct: ((x - left) / width) * 100,
    yPct: ((y - top) / height) * 100,
  };
}

function themeTransitionCss(xPct: number, yPct: number): string {
  return `
/* Titles, tags, cards use view-transition-name for page morphing.
   During a theme switch those names become separate layers that
   skip the root circle reveal — flatten them into root instead. */
html.theme-transitioning * {
  view-transition-name: none !important;
}
::view-transition-old(root) {
  animation: none !important;
  mix-blend-mode: normal;
  z-index: 1;
}
::view-transition-group(root) {
  animation: none !important;
}
::view-transition-new(root) {
  mix-blend-mode: normal;
  z-index: 2147483646;
  animation: xingyao-theme-circle ${TRANSITION_MS}ms ease-in both !important;
}
@keyframes xingyao-theme-circle {
  from { clip-path: circle(0% at ${xPct}% ${yPct}%); }
  to { clip-path: circle(150% at ${xPct}% ${yPct}%); }
}
`;
}

async function applyTheme(
  next: string,
  origin: { x: number; y: number }
): Promise<void> {
  const switchTheme = () => {
    themeValue = next;
    persist();
    (window as unknown as { __theme?: { value: string } }).__theme = {
      value: themeValue,
    };
  };

  if (typeof document.startViewTransition !== "function") {
    switchTheme();
    return;
  }

  const { xPct, yPct } = circleOrigin(origin.x, origin.y);
  const style = document.createElement("style");
  style.setAttribute("data-theme-transition", "");
  style.textContent = themeTransitionCss(xPct, yPct);
  document.head.appendChild(style);

  const root = document.documentElement;
  root.classList.add("theme-transitioning");

  const transition = document.startViewTransition(() => {
    switchTheme();
  });

  try {
    await transition.finished;
  } catch {
    /* skipped or aborted */
  } finally {
    style.remove();
    root.classList.remove("theme-transitioning");
    const glass = document.querySelector(".ios-glass");
    if (glass instanceof HTMLElement) {
      glass.style.backdropFilter = "none";
      glass.style.setProperty("-webkit-backdrop-filter", "none");
      void glass.offsetHeight;
      glass.style.backdropFilter = "";
      glass.style.removeProperty("-webkit-backdrop-filter");
    }
  }
}

function setup(): void {
  reflect();
}

setup();

const bag = window as unknown as {
  __xingyaoThemeAbort?: AbortController;
};
bag.__xingyaoThemeAbort?.abort();
const ac = new AbortController();
bag.__xingyaoThemeAbort = ac;
const { signal } = ac;

window.addEventListener(
  "pointerdown",
  event => {
    pointerX = event.clientX;
    pointerY = event.clientY;
  },
  { capture: true, passive: true, signal }
);

document.addEventListener(
  "click",
  event => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("#theme-btn")) return;
    if (isS65Demo()) return;
    const keyboard =
      event.detail === 0 && event.clientX === 0 && event.clientY === 0;
    const origin = keyboard
      ? (() => {
          const btn = document.querySelector("#theme-btn");
          if (!btn) return { x: innerWidth / 2, y: innerHeight / 2 };
          const rect = btn.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        })()
      : { x: pointerX, y: pointerY };
    void applyTheme(themeValue === LIGHT ? DARK : LIGHT, origin);
  },
  { capture: true, signal }
);

document.addEventListener("astro:after-swap", setup, { signal });

document.addEventListener(
  "astro:before-swap",
  event => {
    const next = (event as { newDocument: Document }).newDocument;
    const nextIsS65 = Boolean(next.querySelector(".s65-page"));
    const shown = nextIsS65 ? DARK : themeValue;
    next.documentElement.setAttribute("data-theme", shown);
    next.documentElement.classList.toggle("dark", shown === DARK);
    next.documentElement.classList.toggle("theme-locked", nextIsS65);

    const currentShown = isS65Demo() ? DARK : themeValue;
    if (shown === currentShown) {
      const color = document
        .querySelector("meta[name='theme-color']")
        ?.getAttribute("content");
      if (color) {
        next
          .querySelector("meta[name='theme-color']")
          ?.setAttribute("content", color);
      }
    }
  },
  { signal }
);

window.matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  ({ matches }) => {
    if (localStorage.getItem(THEME_KEY)) return;
    void applyTheme(matches ? DARK : LIGHT, {
      x: innerWidth / 2,
      y: innerHeight / 2,
    });
  },
  { signal }
);
