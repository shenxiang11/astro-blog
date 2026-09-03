/* Ported from react-bits FuzzyText (MIT):
 * https://reactbits.dev/text-animations/fuzzy-text
 */
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

function toPlainText(node: ReactNode): string {
  return Children.toArray(node)
    .map(child => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (
        !isValidElement<{
          value?: string;
          children?: ReactNode;
          dangerouslySetInnerHTML?: { __html?: string };
        }>(child)
      ) {
        return "";
      }
      const { value, children: nested, dangerouslySetInnerHTML } = child.props;
      if (typeof value === "string") {
        return value.replace(/<[^>]*>/g, "");
      }
      if (typeof dangerouslySetInnerHTML?.__html === "string") {
        return dangerouslySetInnerHTML.__html.replace(/<[^>]*>/g, "");
      }
      if (nested != null) return toPlainText(nested);
      return "";
    })
    .join("")
    .trim();
}

export type FuzzyTextProps = {
  children: ReactNode;
  fontSize?: number | string;
  fontWeight?: string | number;
  fontFamily?: string;
  color?: string;
  enableHover?: boolean;
  baseIntensity?: number;
  hoverIntensity?: number;
  fuzzRange?: number;
  fps?: number;
  direction?: "horizontal" | "vertical" | "both";
  transitionDuration?: number;
  clickEffect?: boolean;
  glitchMode?: boolean;
  glitchInterval?: number;
  glitchDuration?: number;
  gradient?: string[] | null;
  letterSpacing?: number;
  className?: string;
};

type FuzzyCanvas = HTMLCanvasElement & {
  cleanupFuzzyText?: () => void;
};

export default function FuzzyText({
  children,
  fontSize = "clamp(2rem, 10vw, 10rem)",
  fontWeight = 900,
  fontFamily = "inherit",
  color = "currentColor",
  enableHover = true,
  baseIntensity = 0.18,
  hoverIntensity = 0.5,
  fuzzRange = 30,
  fps = 60,
  direction = "horizontal",
  transitionDuration = 0,
  clickEffect = false,
  glitchMode = false,
  glitchInterval = 2000,
  glitchDuration = 200,
  gradient = null,
  letterSpacing = 0,
  className = "",
}: FuzzyTextProps) {
  const canvasRef = useRef<FuzzyCanvas | null>(null);
  const [sceneVersion, setSceneVersion] = useState(0);

  useEffect(() => {
    const bump = () => setSceneVersion(version => version + 1);
    let resizeFrame = 0;
    const onResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(bump);
    };
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    let animationFrameId = 0;
    let isCancelled = false;
    let glitchTimeoutId = 0;
    let glitchEndTimeoutId = 0;
    let clickTimeoutId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const init = async () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const computedFontFamily =
        fontFamily === "inherit"
          ? window.getComputedStyle(canvas).fontFamily || "sans-serif"
          : fontFamily;

      const resolvedColor =
        color === "currentColor" || color === "inherit"
          ? window.getComputedStyle(canvas).color
          : color;

      const fontSizeStr =
        typeof fontSize === "number" ? `${fontSize}px` : fontSize;
      const fontString = `${fontWeight} ${fontSizeStr} ${computedFontFamily}`;

      try {
        await document.fonts.load(fontString);
      } catch {
        await document.fonts.ready;
      }
      if (isCancelled) return;

      let numericFontSize: number;
      if (typeof fontSize === "number") {
        numericFontSize = fontSize;
      } else {
        const temp = document.createElement("span");
        temp.style.fontSize = fontSize;
        document.body.appendChild(temp);
        const computedSize = window.getComputedStyle(temp).fontSize;
        numericFontSize = parseFloat(computedSize);
        document.body.removeChild(temp);
      }

      const text = toPlainText(children);

      const offscreen = document.createElement("canvas");
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return;

      offCtx.font = `${fontWeight} ${fontSizeStr} ${computedFontFamily}`;
      offCtx.textBaseline = "alphabetic";

      let totalWidth = 0;
      if (letterSpacing !== 0) {
        for (const char of text) {
          totalWidth += offCtx.measureText(char).width + letterSpacing;
        }
        totalWidth -= letterSpacing;
      } else {
        totalWidth = offCtx.measureText(text).width;
      }

      const metrics = offCtx.measureText(text);
      const actualLeft = metrics.actualBoundingBoxLeft ?? 0;
      const actualRight =
        letterSpacing !== 0
          ? totalWidth
          : (metrics.actualBoundingBoxRight ?? metrics.width);
      const actualAscent = metrics.actualBoundingBoxAscent ?? numericFontSize;
      const actualDescent =
        metrics.actualBoundingBoxDescent ?? numericFontSize * 0.2;

      const textBoundingWidth = Math.ceil(
        letterSpacing !== 0 ? totalWidth : actualLeft + actualRight
      );
      const tightHeight = Math.ceil(actualAscent + actualDescent);

      const extraWidthBuffer = 10;
      const offscreenWidth = textBoundingWidth + extraWidthBuffer;

      offscreen.width = offscreenWidth;
      offscreen.height = tightHeight;

      const xOffset = extraWidthBuffer / 2;
      offCtx.font = `${fontWeight} ${fontSizeStr} ${computedFontFamily}`;
      offCtx.textBaseline = "alphabetic";

      if (gradient && Array.isArray(gradient) && gradient.length >= 2) {
        const grad = offCtx.createLinearGradient(0, 0, offscreenWidth, 0);
        gradient.forEach((stopColor, i) =>
          grad.addColorStop(i / (gradient.length - 1), stopColor)
        );
        offCtx.fillStyle = grad;
      } else {
        offCtx.fillStyle = resolvedColor;
      }

      if (letterSpacing !== 0) {
        let xPos = xOffset;
        for (const char of text) {
          offCtx.fillText(char, xPos, actualAscent);
          xPos += offCtx.measureText(char).width + letterSpacing;
        }
      } else {
        offCtx.fillText(text, xOffset - actualLeft, actualAscent);
      }

      const horizontalMargin = fuzzRange + 20;
      const verticalMargin = 0;
      canvas.width = offscreenWidth + horizontalMargin * 2;
      canvas.height = tightHeight + verticalMargin * 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(horizontalMargin, verticalMargin);

      const interactiveLeft = horizontalMargin + xOffset;
      const interactiveTop = verticalMargin;
      const interactiveRight = interactiveLeft + textBoundingWidth;
      const interactiveBottom = interactiveTop + tightHeight;

      let isHovering = false;
      let isClicking = false;
      let isGlitching = false;
      let currentIntensity = baseIntensity;
      let targetIntensity = baseIntensity;
      let lastFrameTime = 0;
      const frameDuration = 1000 / fps;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      const startGlitchLoop = () => {
        if (!glitchMode || isCancelled || reduceMotion) return;
        glitchTimeoutId = window.setTimeout(() => {
          if (isCancelled) return;
          isGlitching = true;
          glitchEndTimeoutId = window.setTimeout(() => {
            isGlitching = false;
            startGlitchLoop();
          }, glitchDuration);
        }, glitchInterval);
      };

      if (glitchMode) startGlitchLoop();

      const drawDisplaced = (intensity: number) => {
        ctx.clearRect(
          -fuzzRange - 20,
          -fuzzRange - 10,
          offscreenWidth + 2 * (fuzzRange + 20),
          tightHeight + 2 * (fuzzRange + 10)
        );

        if (intensity <= 0 || reduceMotion) {
          ctx.drawImage(offscreen, 0, 0);
          return;
        }

        if (direction === "horizontal") {
          for (let j = 0; j < tightHeight; j++) {
            const dx = Math.floor(intensity * (Math.random() - 0.5) * fuzzRange);
            ctx.drawImage(
              offscreen,
              0,
              j,
              offscreenWidth,
              1,
              dx,
              j,
              offscreenWidth,
              1
            );
          }
        } else if (direction === "vertical") {
          for (let i = 0; i < offscreenWidth; i++) {
            const dy = Math.floor(intensity * (Math.random() - 0.5) * fuzzRange);
            ctx.drawImage(
              offscreen,
              i,
              0,
              1,
              tightHeight,
              i,
              dy,
              1,
              tightHeight
            );
          }
        } else {
          for (let j = 0; j < tightHeight; j++) {
            const dx = Math.floor(intensity * (Math.random() - 0.5) * fuzzRange);
            ctx.drawImage(
              offscreen,
              0,
              j,
              offscreenWidth,
              1,
              dx,
              j,
              offscreenWidth,
              1
            );
          }
          const tempData = ctx.getImageData(
            0,
            0,
            offscreenWidth + fuzzRange,
            tightHeight + fuzzRange
          );
          ctx.clearRect(
            -fuzzRange - 20,
            -fuzzRange - 10,
            offscreenWidth + 2 * (fuzzRange + 20),
            tightHeight + 2 * (fuzzRange + 10)
          );
          ctx.putImageData(tempData, 0, 0);
          for (let i = 0; i < offscreenWidth + fuzzRange; i++) {
            const dy = Math.floor(
              intensity * (Math.random() - 0.5) * fuzzRange * 0.5
            );
            const colData = ctx.getImageData(i, 0, 1, tightHeight + fuzzRange);
            ctx.clearRect(i, -fuzzRange, 1, tightHeight + 2 * fuzzRange);
            ctx.putImageData(colData, i, dy);
          }
        }
      };

      if (reduceMotion) {
        drawDisplaced(0);
        return;
      }

      const run = (timestamp: number) => {
        if (isCancelled) return;

        if (timestamp - lastFrameTime < frameDuration) {
          animationFrameId = window.requestAnimationFrame(run);
          return;
        }
        lastFrameTime = timestamp;

        if (isClicking) {
          targetIntensity = 1;
        } else if (isGlitching) {
          targetIntensity = 1;
        } else if (isHovering) {
          targetIntensity = hoverIntensity;
        } else {
          targetIntensity = baseIntensity;
        }

        if (transitionDuration > 0) {
          const step = 1 / (transitionDuration / frameDuration);
          if (currentIntensity < targetIntensity) {
            currentIntensity = Math.min(
              currentIntensity + step,
              targetIntensity
            );
          } else if (currentIntensity > targetIntensity) {
            currentIntensity = Math.max(
              currentIntensity - step,
              targetIntensity
            );
          }
        } else {
          currentIntensity = targetIntensity;
        }

        drawDisplaced(currentIntensity);
        animationFrameId = window.requestAnimationFrame(run);
      };

      animationFrameId = window.requestAnimationFrame(run);

      const isInsideTextArea = (x: number, y: number) => {
        return (
          x >= interactiveLeft &&
          x <= interactiveRight &&
          y >= interactiveTop &&
          y <= interactiveBottom
        );
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!enableHover) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        isHovering = isInsideTextArea(x, y);
      };

      const handleMouseLeave = () => {
        isHovering = false;
      };

      const handleClick = () => {
        if (!clickEffect) return;
        isClicking = true;
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = window.setTimeout(() => {
          isClicking = false;
        }, 150);
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (!enableHover) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        if (!touch) return;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;
        isHovering = isInsideTextArea(x, y);
      };

      const handleTouchEnd = () => {
        isHovering = false;
      };

      if (enableHover) {
        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("mouseleave", handleMouseLeave);
        canvas.addEventListener("touchmove", handleTouchMove, {
          passive: false,
        });
        canvas.addEventListener("touchend", handleTouchEnd);
      }

      if (clickEffect) {
        canvas.addEventListener("click", handleClick);
      }

      const cleanup = () => {
        window.cancelAnimationFrame(animationFrameId);
        window.clearTimeout(glitchTimeoutId);
        window.clearTimeout(glitchEndTimeoutId);
        window.clearTimeout(clickTimeoutId);
        if (enableHover) {
          canvas.removeEventListener("mousemove", handleMouseMove);
          canvas.removeEventListener("mouseleave", handleMouseLeave);
          canvas.removeEventListener("touchmove", handleTouchMove);
          canvas.removeEventListener("touchend", handleTouchEnd);
        }
        if (clickEffect) {
          canvas.removeEventListener("click", handleClick);
        }
      };

      canvas.cleanupFuzzyText = cleanup;
    };

    void init();

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(glitchTimeoutId);
      window.clearTimeout(glitchEndTimeoutId);
      window.clearTimeout(clickTimeoutId);
      canvas.cleanupFuzzyText?.();
    };
  }, [
    children,
    fontSize,
    fontWeight,
    fontFamily,
    color,
    enableHover,
    baseIntensity,
    hoverIntensity,
    fuzzRange,
    fps,
    direction,
    transitionDuration,
    clickEffect,
    glitchMode,
    glitchInterval,
    glitchDuration,
    gradient,
    letterSpacing,
    sceneVersion,
  ]);

  return <canvas ref={canvasRef} className={className} />;
}
