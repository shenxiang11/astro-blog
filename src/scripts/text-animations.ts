import {
  TEXT_ANIMATIONS,
  TEXT_KEYFRAMES,
  type TextAnimation,
} from "@/data/textAnimations";

const WAIT_MS = 2500;
const STYLE_ID = "ta-keyframes";
const SHUFFLE_SYMBOLS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";

const byId = new Map(TEXT_ANIMATIONS.map(anim => [anim.id, anim]));

let cleanup: (() => void) | undefined;
let customText = "";
let filterMode: "all" | "picked" = "all";
const picked = new Set<string>();
const visible = new Set<string>();
const generation = new Map<string, number>();
const loopTimers = new Map<string, Set<number>>();

function bump(id: string) {
  const next = (generation.get(id) ?? 0) + 1;
  generation.set(id, next);
  const timers = loopTimers.get(id);
  if (timers) {
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
  }
  return next;
}

function alive(id: string, gen: number) {
  return generation.get(id) === gen;
}

function later(id: string, gen: number, ms: number, fn: () => void) {
  const timers = loopTimers.get(id) ?? new Set<number>();
  loopTimers.set(id, timers);
  const timer = window.setTimeout(() => {
    timers.delete(timer);
    if (!alive(id, gen)) return;
    fn();
  }, ms);
  timers.add(timer);
}

function ensureKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = Object.values(TEXT_KEYFRAMES).join("\n");
  document.head.appendChild(style);
}

function stageOf(id: string) {
  return document.querySelector<HTMLElement>(`[data-anim-id="${id}"] [data-ta-stage]`);
}

function displayText(anim: TextAnimation) {
  return customText || anim.text;
}

function charSpan(char: string) {
  const span = document.createElement("span");
  span.className = "ta-char";
  span.textContent = char;
  return span;
}

function playCss(container: HTMLElement, anim: TextAnimation, gen: number) {
  const params = anim.cssParams;
  if (!params) return;
  const text = displayText(anim);
  const keyframe = `ta-${params.name}`;

  if (params.split === false) {
    const span = document.createElement("span");
    span.textContent = text;
    span.style.opacity = "0";
    span.style.animation = `${keyframe} ${params.duration}s forwards`;
    container.append(span);
    later(
      anim.id,
      gen,
      params.duration * 1000 + WAIT_MS,
      () => playAnim(anim.id)
    );
    return;
  }

  const delay = params.delayStep ?? 0.05;
  const chars = [...text];
  chars.forEach((char, index) => {
    const span = charSpan(char);
    span.style.opacity = "0";
    span.style.animation = `${keyframe} ${params.duration}s forwards`;
    span.style.animationDelay = `${index * delay}s`;
    container.append(span);
  });
  later(
    anim.id,
    gen,
    chars.length * delay * 1000 + params.duration * 1000 + WAIT_MS,
    () => playAnim(anim.id)
  );
}

function playTypewriter(container: HTMLElement, anim: TextAnimation, gen: number) {
  const chars = [...displayText(anim)];
  let i = 0;
  const type = () => {
    if (!alive(anim.id, gen)) return;
    if (i < chars.length) {
      container.append(charSpan(chars[i]));
      i += 1;
      later(anim.id, gen, 80, type);
    } else {
      later(anim.id, gen, WAIT_MS, () => playAnim(anim.id));
    }
  };
  type();
}

function playShuffle(
  container: HTMLElement,
  anim: TextAnimation,
  gen: number,
  mode: "shuffle" | "binary"
) {
  const chars = [...displayText(anim)];
  const items = chars.map(char => {
    const el = charSpan("");
    container.append(el);
    return { el, char, isSpace: char === " " };
  });
  const startMul = mode === "binary" ? 3 : 2;
  const span = mode === "binary" ? 20 : 15;
  const frameDelay = mode === "binary" ? 40 : 30;
  let frame = 0;

  const update = () => {
    if (!alive(anim.id, gen)) return;
    let done = true;
    for (const [i, item] of items.entries()) {
      if (item.isSpace) {
        item.el.textContent = " ";
        continue;
      }
      const start = i * startMul;
      const end = start + span;
      if (frame < start) {
        done = false;
        item.el.textContent = "";
      } else if (frame < end) {
        done = false;
        item.el.textContent =
          mode === "binary"
            ? Math.random() > 0.5
              ? "1"
              : "0"
            : SHUFFLE_SYMBOLS[Math.floor(Math.random() * SHUFFLE_SYMBOLS.length)];
      } else {
        item.el.textContent = item.char;
      }
    }
    frame += 1;
    if (!done) later(anim.id, gen, frameDelay, update);
    else later(anim.id, gen, WAIT_MS, () => playAnim(anim.id));
  };
  update();
}

function playRandomReveal(container: HTMLElement, anim: TextAnimation, gen: number) {
  const chars = [...displayText(anim)];
  const order = chars.map((_, i) => i).sort(() => Math.random() - 0.5);
  chars.forEach(char => {
    const span = charSpan(char);
    span.style.opacity = "0";
    container.append(span);
  });
  const spans = container.querySelectorAll<HTMLElement>(".ta-char");
  let i = 0;
  const reveal = () => {
    if (!alive(anim.id, gen)) return;
    if (i < order.length) {
      spans[order[i]].style.opacity = "1";
      i += 1;
      later(anim.id, gen, 50, reveal);
    } else {
      later(anim.id, gen, WAIT_MS, () => playAnim(anim.id));
    }
  };
  reveal();
}

function playBlockReveal(container: HTMLElement, anim: TextAnimation, gen: number) {
  const wrap = document.createElement("span");
  wrap.className = "ta-block-wrap";
  const textEl = document.createElement("span");
  textEl.className = "ta-block-text";
  textEl.textContent = displayText(anim);
  const mask = document.createElement("span");
  mask.className = "ta-block-mask";
  wrap.append(textEl, mask);
  container.append(wrap);

  later(anim.id, gen, 100, () => {
    mask.style.transform = "scaleX(1)";
  });
  later(anim.id, gen, 600, () => {
    textEl.style.opacity = "1";
    mask.style.transformOrigin = "right";
    mask.style.transform = "scaleX(0)";
  });
  later(anim.id, gen, WAIT_MS + 1100, () => playAnim(anim.id));
}

function playSpotlight(container: HTMLElement, anim: TextAnimation, gen: number) {
  const span = document.createElement("span");
  span.className = "ta-spotlight";
  span.textContent = displayText(anim);
  container.append(span);
  later(anim.id, gen, WAIT_MS + 2000, () => playAnim(anim.id));
}

function playCursorType(container: HTMLElement, anim: TextAnimation, gen: number) {
  const textEl = document.createElement("span");
  const cursor = document.createElement("span");
  cursor.className = "ta-cursor";
  container.append(textEl, cursor);
  const chars = [...displayText(anim)];
  let i = 0;
  const type = () => {
    if (!alive(anim.id, gen)) return;
    if (i < chars.length) {
      textEl.textContent += chars[i];
      i += 1;
      later(anim.id, gen, 100, type);
    } else {
      later(anim.id, gen, WAIT_MS, () => playAnim(anim.id));
    }
  };
  type();
}

function playReduced(container: HTMLElement, anim: TextAnimation) {
  container.textContent = displayText(anim);
}

export function playAnim(id: string) {
  const anim = byId.get(id);
  const container = stageOf(id);
  if (!anim || !container) return;
  const gen = bump(id);
  container.replaceChildren();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    playReduced(container, anim);
    return;
  }

  switch (anim.type) {
    case "js_typewriter":
      playTypewriter(container, anim, gen);
      break;
    case "js_shuffle":
      playShuffle(container, anim, gen, "shuffle");
      break;
    case "js_binary":
      playShuffle(container, anim, gen, "binary");
      break;
    case "js_random_reveal":
      playRandomReveal(container, anim, gen);
      break;
    case "js_block_reveal":
      playBlockReveal(container, anim, gen);
      break;
    case "js_spotlight":
      playSpotlight(container, anim, gen);
      break;
    case "js_cursor_typewriter":
      playCursorType(container, anim, gen);
      break;
    default:
      playCss(container, anim, gen);
  }
}

function restartVisible() {
  for (const id of visible) playAnim(id);
}

function setFilter(mode: "all" | "picked") {
  filterMode = mode;
  document.querySelectorAll<HTMLElement>("[data-ta-filter]").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.taFilter === mode);
  });
  const cards = document.querySelectorAll<HTMLElement>(".ta-card[data-anim-id]");
  let shown = 0;
  cards.forEach(card => {
    const hide = mode === "picked" && !picked.has(card.dataset.animId ?? "");
    card.classList.toggle("is-hidden", hide);
    if (!hide) shown += 1;
  });
  document.querySelector("[data-ta-empty]")?.classList.toggle("is-visible", shown === 0);
}

function togglePick(id: string) {
  const card = document.querySelector<HTMLElement>(`.ta-card[data-anim-id="${id}"]`);
  const btn = card?.querySelector<HTMLButtonElement>("[data-ta-pick]");
  if (!card || !btn) return;

  if (picked.has(id)) {
    picked.delete(id);
    card.classList.remove("is-picked");
    btn.classList.remove("is-picked");
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = "☆";
    if (filterMode === "picked") card.classList.add("is-hidden");
  } else {
    picked.add(id);
    card.classList.add("is-picked");
    btn.classList.add("is-picked");
    btn.setAttribute("aria-pressed", "true");
    btn.textContent = "★";
  }

  const count = document.querySelector("[data-ta-picked-count]");
  if (count) count.textContent = String(picked.size);
  if (filterMode === "picked") setFilter("picked");
}

function escapeJs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${")
    .replaceAll("</", "<\\/");
}

function buildCopyHtml(anim: TextAnimation) {
  const text = escapeJs(displayText(anim));
  const extraCss: string[] = [
    `.char { display: inline-block; white-space: pre; }`,
  ];

  if (anim.type === "js_spotlight") extraCss.push(TEXT_KEYFRAMES.spotlightSweep);
  if (anim.type === "js_cursor_typewriter") extraCss.push(TEXT_KEYFRAMES.blinkCursor);
  if (anim.type === "css" && anim.cssParams) {
    extraCss.push(TEXT_KEYFRAMES[anim.cssParams.name] ?? "");
  }

  const playJs = copyPlayJs(anim);

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>${anim.name}</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0b0b0d;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
      font-size: 2.5rem;
      font-weight: 400;
      letter-spacing: 0.04em;
    }
    ${extraCss.filter(Boolean).join("\n    ")}
  </style>
</head>
<body>
  <div id="stage"></div>
  <script>
    const text = \`${text}\`;
    const stage = document.getElementById("stage");
    const wait = ${WAIT_MS};
    ${playJs}
  <\/script>
</body>
</html>`;
}

function copyPlayJs(anim: TextAnimation) {
  switch (anim.type) {
    case "js_typewriter":
      return `function play() {
      stage.replaceChildren();
      const chars = [...text];
      let i = 0;
      const type = () => {
        if (i < chars.length) {
          const span = document.createElement("span");
          span.className = "char";
          span.textContent = chars[i++];
          stage.append(span);
          setTimeout(type, 80);
        } else setTimeout(play, wait);
      };
      type();
    }
    play();`;
    case "js_shuffle":
      return `const symbols = ${JSON.stringify(SHUFFLE_SYMBOLS)};
    function play() {
      stage.replaceChildren();
      const items = [...text].map((char) => {
        const el = document.createElement("span");
        el.className = "char";
        stage.append(el);
        return { el, char, isSpace: char === " " };
      });
      let frame = 0;
      const update = () => {
        let done = true;
        items.forEach((item, i) => {
          if (item.isSpace) { item.el.textContent = " "; return; }
          const start = i * 2, end = start + 15;
          if (frame < start) { done = false; item.el.textContent = ""; }
          else if (frame < end) { done = false; item.el.textContent = symbols[Math.floor(Math.random() * symbols.length)]; }
          else item.el.textContent = item.char;
        });
        frame++;
        if (!done) setTimeout(update, 30);
        else setTimeout(play, wait);
      };
      update();
    }
    play();`;
    case "js_binary":
      return `function play() {
      stage.replaceChildren();
      const items = [...text].map((char) => {
        const el = document.createElement("span");
        el.className = "char";
        stage.append(el);
        return { el, char, isSpace: char === " " };
      });
      let frame = 0;
      const update = () => {
        let done = true;
        items.forEach((item, i) => {
          if (item.isSpace) { item.el.textContent = " "; return; }
          const start = i * 3, end = start + 20;
          if (frame < start) { done = false; item.el.textContent = ""; }
          else if (frame < end) { done = false; item.el.textContent = Math.random() > 0.5 ? "1" : "0"; }
          else item.el.textContent = item.char;
        });
        frame++;
        if (!done) setTimeout(update, 40);
        else setTimeout(play, wait);
      };
      update();
    }
    play();`;
    case "js_random_reveal":
      return `function play() {
      stage.replaceChildren();
      const chars = [...text];
      const order = chars.map((_, i) => i).sort(() => Math.random() - 0.5);
      chars.forEach((char) => {
        const span = document.createElement("span");
        span.className = "char";
        span.textContent = char;
        span.style.opacity = "0";
        stage.append(span);
      });
      const spans = stage.querySelectorAll(".char");
      let i = 0;
      const reveal = () => {
        if (i < order.length) {
          spans[order[i++]].style.opacity = "1";
          setTimeout(reveal, 50);
        } else setTimeout(play, wait);
      };
      reveal();
    }
    play();`;
    case "js_block_reveal":
      return `function play() {
      stage.replaceChildren();
      const wrap = document.createElement("span");
      wrap.style.cssText = "position:relative;display:inline-block;overflow:hidden";
      const textEl = document.createElement("span");
      textEl.style.cssText = "display:inline-block;opacity:0";
      textEl.textContent = text;
      const mask = document.createElement("span");
      mask.style.cssText = "position:absolute;inset:0;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .5s cubic-bezier(.86,0,.07,1)";
      wrap.append(textEl, mask);
      stage.append(wrap);
      setTimeout(() => { mask.style.transform = "scaleX(1)"; }, 100);
      setTimeout(() => {
        textEl.style.opacity = "1";
        mask.style.transformOrigin = "right";
        mask.style.transform = "scaleX(0)";
      }, 600);
      setTimeout(play, wait + 1100);
    }
    play();`;
    case "js_spotlight":
      return `function play() {
      stage.replaceChildren();
      const span = document.createElement("span");
      span.textContent = text;
      span.style.cssText = "background:linear-gradient(to right,#71717a 0%,#f4f4f5 50%,#71717a 100%);background-size:200% auto;color:transparent;-webkit-background-clip:text;background-clip:text;animation:ta-spotlightSweep 2s linear forwards";
      stage.append(span);
      setTimeout(play, wait + 2000);
    }
    play();`;
    case "js_cursor_typewriter":
      return `function play() {
      stage.replaceChildren();
      const textEl = document.createElement("span");
      const cursor = document.createElement("span");
      cursor.style.cssText = "display:inline-block;width:2px;height:1.1em;margin-left:4px;background:currentColor;vertical-align:middle;animation:ta-blinkCursor 1s infinite";
      stage.append(textEl, cursor);
      const chars = [...text];
      let i = 0;
      const type = () => {
        if (i < chars.length) {
          textEl.textContent += chars[i++];
          setTimeout(type, 100);
        } else setTimeout(play, wait);
      };
      type();
    }
    play();`;
    default: {
      const params = anim.cssParams!;
      const name = `ta-${params.name}`;
      if (params.split === false) {
        return `function play() {
      stage.replaceChildren();
      const span = document.createElement("span");
      span.textContent = text;
      span.style.opacity = "0";
      span.style.animation = "${name} ${params.duration}s forwards";
      stage.append(span);
      setTimeout(play, ${params.duration} * 1000 + wait);
    }
    play();`;
      }
      return `function play() {
      stage.replaceChildren();
      [...text].forEach((char, index) => {
        const span = document.createElement("span");
        span.className = "char";
        span.textContent = char;
        span.style.opacity = "0";
        span.style.animation = "${name} ${params.duration}s forwards";
        span.style.animationDelay = (index * ${params.delayStep ?? 0.05}) + "s";
        stage.append(span);
      });
      setTimeout(play, text.length * ${params.delayStep ?? 0.05} * 1000 + ${params.duration} * 1000 + wait);
    }
    play();`;
    }
  }
}

async function copyCode(id: string, btn: HTMLButtonElement) {
  const anim = byId.get(id);
  if (!anim) return;
  const html = buildCopyHtml(anim);
  try {
    await navigator.clipboard.writeText(html);
  } catch {
    const area = document.createElement("textarea");
    area.value = html;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  const labels = document.getElementById("main-content");
  const copied = labels?.dataset.taCopied || "Copied";
  const copiedNamed = labels?.dataset.taCopiedNamed || "Copied {name}";
  const original = btn.textContent;
  btn.textContent = copied;
  btn.classList.add("is-copied");
  const toast = document.querySelector("[data-ta-toast]");
  if (toast) {
    toast.textContent = copiedNamed.replace("{name}", anim.name);
    toast.classList.add("is-on");
  }
  window.setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("is-copied");
    toast?.classList.remove("is-on");
  }, 1800);
}

function start(root: HTMLElement) {
  ensureKeyframes();
  picked.clear();
  filterMode = "all";
  customText = "";

  const page = document.getElementById("main-content");
  const input = document.querySelector<HTMLInputElement>("[data-ta-input]");
  let debounce = 0;

  const onInput = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      customText = input?.value.trim() ?? "";
      restartVisible();
    }, 320);
  };

  const onClick = (event: Event) => {
    const btn = (event.target as HTMLElement).closest("button");
    if (!btn) return;
    if (btn.dataset.taFilter) {
      setFilter(btn.dataset.taFilter as "all" | "picked");
      return;
    }
    const card = btn.closest<HTMLElement>("[data-anim-id]");
    const id = card?.dataset.animId;
    if (!id) return;
    if (btn.hasAttribute("data-ta-pick")) togglePick(id);
    else if (btn.hasAttribute("data-ta-restart")) playAnim(id);
    else if (btn.hasAttribute("data-ta-copy")) void copyCode(id, btn);
  };

  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.animId;
        if (!id) continue;
        if (entry.isIntersecting) {
          visible.add(id);
          playAnim(id);
        } else {
          visible.delete(id);
          bump(id);
        }
      }
    },
    { rootMargin: "120px 0px" }
  );

  root.querySelectorAll<HTMLElement>(".ta-card[data-anim-id]").forEach(card => {
    observer.observe(card);
  });

  input?.addEventListener("input", onInput);
  page?.addEventListener("click", onClick);

  return () => {
    observer.disconnect();
    input?.removeEventListener("input", onInput);
    page?.removeEventListener("click", onClick);
    window.clearTimeout(debounce);
    for (const id of [...generation.keys()]) bump(id);
    visible.clear();
  };
}

export function initTextAnimations() {
  cleanup?.();
  const grid = document.querySelector<HTMLElement>("[data-ta-grid]");
  if (!grid) {
    cleanup = undefined;
    return;
  }
  cleanup = start(grid);
}
