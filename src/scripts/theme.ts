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

function themeTransitionCss(): string {
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
/* animate="none" sets the old snapshot to opacity: 0. Keep it
   visible so the new theme expands as a hard circle over it. */
::view-transition-old(root) {
  z-index: 1;
  opacity: 1 !important;
}
::view-transition-new(root) {
  z-index: 2147483646;
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

  const x = origin.x;
  const y = origin.y;
  const endRadius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y)
  );
  const style = document.createElement("style");
  style.setAttribute("data-theme-transition", "");
  style.textContent = themeTransitionCss();
  document.head.appendChild(style);

  const root = document.documentElement;
  const glass = document.querySelector(".ios-glass");
  // backdrop-filter on the sticky nav makes Chrome abort the snapshot.
  if (glass instanceof HTMLElement) {
    glass.style.backdropFilter = "none";
    glass.style.setProperty("-webkit-backdrop-filter", "none");
  }
  root.classList.add("theme-transitioning");
  root.style.setProperty("view-transition-name", "root", "important");

  try {
    const transition = document.startViewTransition(() => {
      switchTheme();
    });
    await transition.ready;
    await document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: TRANSITION_MS,
        easing: "ease-in",
        fill: "both",
        pseudoElement: "::view-transition-new(root)",
      }
    ).finished;
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
