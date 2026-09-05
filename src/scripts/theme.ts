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

function pageThemeLock(pathname = location.pathname): "dark" | "light" | null {
  if (/(?:^|\/)demos\/(?:s65|drawn-together)\/?$/.test(pathname)) return "dark";
  if (/(?:^|\/)demos\/shanghai\/?$/.test(pathname)) return "light";
  return null;
}

function isThemeLocked(): boolean {
  return pageThemeLock() !== null;
}

function persist(): void {
  localStorage.setItem(THEME_KEY, themeValue);
  reflect();
}

function reflect(): void {
  const locked = pageThemeLock();
  const shown = locked ?? themeValue;
  const root = document.documentElement;
  root.setAttribute("data-theme", shown);
  root.classList.toggle("dark", shown === DARK);
  root.classList.toggle("theme-locked", Boolean(locked));
  document.querySelector("#theme-btn")?.setAttribute("aria-label", themeValue);

  const bg = window.getComputedStyle(document.body).backgroundColor;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bg);
}

function themeTransitionCss(xPct: number, yPct: number): string {
  return `
html.theme-transitioning {
  view-transition-name: root !important;
}
html.theme-transitioning * {
  view-transition-name: none !important;
}
::view-transition-old(root),
::view-transition-new(root) {
  animation: none !important;
  mix-blend-mode: normal;
}
::view-transition-group(root) {
  animation: none !important;
}
::view-transition-old(root) {
  z-index: 1;
  opacity: 1 !important;
}
::view-transition-new(root) {
  z-index: 2147483646;
  animation: xingyao-theme-circle ${TRANSITION_MS}ms ease-in both !important;
}
@keyframes xingyao-theme-circle {
  from { clip-path: circle(0% at ${xPct}% ${yPct}%); }
  to { clip-path: circle(150% at ${xPct}% ${yPct}%); }
}
`;
}

function kickGlass(glass: Element | null): void {
  if (!(glass instanceof HTMLElement)) return;
  glass.style.backdropFilter = "none";
  glass.style.setProperty("-webkit-backdrop-filter", "none");
  void glass.offsetHeight;
  glass.style.backdropFilter = "";
  glass.style.removeProperty("-webkit-backdrop-filter");
}

function viewportPoint(clientX: number, clientY: number): {
  xPct: number;
  yPct: number;
} {
  const vv = window.visualViewport;
  const width = vv?.width || innerWidth;
  const height = vv?.height || innerHeight;
  const x = clientX - (vv?.offsetLeft ?? 0);
  const y = clientY - (vv?.offsetTop ?? 0);
  return {
    xPct: (x / width) * 100,
    yPct: (y / height) * 100,
  };
}

function clickOrigin(event: MouseEvent): { xPct: number; yPct: number } {
  if (event.detail > 0 || event.clientX !== 0 || event.clientY !== 0) {
    return viewportPoint(event.clientX, event.clientY);
  }
  const btn = document.querySelector("#theme-btn");
  if (btn) {
    const rect = btn.getBoundingClientRect();
    return viewportPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
  }
  return viewportPoint(pointerX, pointerY);
}

async function applyTheme(
  next: string,
  origin: { xPct: number; yPct: number }
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

  const style = document.createElement("style");
  style.setAttribute("data-theme-transition", "");
  style.textContent = themeTransitionCss(origin.xPct, origin.yPct);
  document.head.appendChild(style);

  const root = document.documentElement;
  const glass = document.querySelector(".ios-glass");
  root.classList.add("theme-transitioning");
  root.style.setProperty("view-transition-name", "root", "important");

  try {
    const transition = document.startViewTransition(() => {
      switchTheme();
    });
    await transition.finished;
  } catch {
    /* skipped or aborted */
  } finally {
    style.remove();
    root.classList.remove("theme-transitioning");
    root.style.removeProperty("view-transition-name");
    kickGlass(glass);
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
    if (isThemeLocked()) return;
    void applyTheme(themeValue === LIGHT ? DARK : LIGHT, clickOrigin(event));
  },
  { capture: true, signal }
);

document.addEventListener("astro:after-swap", setup, { signal });

document.addEventListener(
  "astro:before-swap",
  event => {
    const next = (event as { newDocument: Document }).newDocument;
    const nextLock = next.querySelector(".s65-page, .dt-page")
      ? "dark"
      : next.querySelector(".sh-page")
        ? "light"
        : null;
    const shown = nextLock ?? themeValue;
    next.documentElement.setAttribute("data-theme", shown);
    next.documentElement.classList.toggle("dark", shown === DARK);
    next.documentElement.classList.toggle("theme-locked", Boolean(nextLock));

    const currentShown = pageThemeLock() ?? themeValue;
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
    void applyTheme(matches ? DARK : LIGHT, { xPct: 50, yPct: 50 });
  },
  { signal }
);
