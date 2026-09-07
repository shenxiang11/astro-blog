/* Ported from yuanyang749/softie-webgpu (MIT)
 * https://github.com/yuanyang749/softie-webgpu
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  SoftieExperience,
  type SoftieErrorKey,
  type SoftieStatus,
} from "./experience";
import { sound } from "./sound";
import { getSoftieCopy } from "./copy";

const DEFAULTS = { color: "#f17fa9", stiffness: 35, damping: 45, volume: 80 };
const PRESETS = [
  { color: "#f17fa9", name: "strawberry", pitch: 1.1 },
  { color: "#a5e0cd", name: "mint", pitch: 1.25 },
  { color: "#c8afec", name: "grape", pitch: 0.95 },
] as const;
const CUSTOM_DEFAULT = "#ffb86c";
const MIN_PRELOADER_MS = 3000;

type ColorKind = "strawberry" | "mint" | "grape" | "custom";

export default function Softie({ locale }: { locale?: string }) {
  const t = getSoftieCopy(locale);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const expRef = useRef<SoftieExperience | null>(null);
  const resetIconRef = useRef<SVGSVGElement>(null);
  const spinTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<SoftieStatus>("pending");
  const [errorKey, setErrorKey] = useState<SoftieErrorKey>("initFailed");
  const [loadingDone, setLoadingDone] = useState(false);
  const [interaction, setInteraction] = useState<"idle" | "grabbing">("idle");
  const [color, setColor] = useState(DEFAULTS.color);
  const [colorKind, setColorKind] = useState<ColorKind>("strawberry");
  const [customColor, setCustomColor] = useState(CUSTOM_DEFAULT);
  const [stiffness, setStiffness] = useState(DEFAULTS.stiffness);
  const [damping, setDamping] = useState(DEFAULTS.damping);
  const [volume, setVolume] = useState(() => Math.round(sound.volume * 100));
  const [soundOn, setSoundOn] = useState(() => sound.enabled);
  const [controlsOn, setControlsOn] = useState(false);
  const lastStiffness = useRef(DEFAULTS.stiffness);
  const lastDamping = useRef(DEFAULTS.damping);
  const lastVolume = useRef(Math.round(sound.volume * 100));

  const colorName =
    colorKind === "custom"
      ? t.custom
      : t[colorKind];

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const started = performance.now();
    let readyTimer = 0;
    const experience = new SoftieExperience(canvas, stage, {
      onStatus: next => {
        setStatus(next);
        if (next === "ready") {
          const delay = Math.max(0, MIN_PRELOADER_MS - (performance.now() - started));
          readyTimer = window.setTimeout(() => {
            setLoadingDone(true);
            setControlsOn(true);
            experience.wakeup();
          }, delay);
        }
      },
      onError: key => {
        setErrorKey(key);
        setStatus("error");
        setLoadingDone(true);
      },
      onFps: () => {},
      onInteraction: setInteraction,
    });
    expRef.current = experience;
    experience.start().catch(error => {
      console.error("[softie] WebGPU initialization:", error);
      const message = error instanceof Error ? error.message : "";
      const key: SoftieErrorKey =
        message === "gpuUnsupported" ||
        message === "nativeRequired" ||
        message === "deviceLost"
          ? message
          : "initFailed";
      setErrorKey(key);
      setStatus("error");
      setLoadingDone(true);
    });

    return () => {
      window.clearTimeout(readyTimer);
      experience.dispose();
      expRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", color);
    return () => {
      document.documentElement.style.removeProperty("--accent");
    };
  }, [color]);

  const applyColor = useCallback((next: string, kind: ColorKind, pitch: number) => {
    setColor(next);
    setColorKind(kind);
    expRef.current?.setColor(next);
    sound.playBubble(pitch);
    if (kind !== "custom") {
      window.setTimeout(() => sound.playHappyPurr(), 140);
    }
  }, []);

  const onRange = (
    id: "stiffness" | "damping",
    value: number,
    last: { current: number }
  ) => {
    if (id === "stiffness") setStiffness(value);
    else setDamping(value);
    if (Math.abs(value - last.current) >= 3) {
      sound.playSliderTick();
      last.current = value;
    }
    if (id === "stiffness") expRef.current?.setStiffness(value / 100);
    else expRef.current?.setDamping(value / 100);
  };

  const onVolume = (value: number) => {
    setVolume(value);
    sound.setVolume(value / 100);
    setSoundOn(sound.enabled);
    if (Math.abs(value - lastVolume.current) >= 4) {
      sound.playSliderTick();
      lastVolume.current = value;
    }
  };

  const spinReset = () => {
    const icon = resetIconRef.current;
    if (!icon) return;
    icon.classList.remove("is-spinning");
    void icon.getBoundingClientRect();
    icon.classList.add("is-spinning");
    const animations = icon.getAnimations?.() ?? [];
    for (const anim of animations) {
      anim.currentTime = 0;
      anim.play();
    }
    if (spinTimerRef.current) window.clearTimeout(spinTimerRef.current);
    spinTimerRef.current = window.setTimeout(() => {
      icon.classList.remove("is-spinning");
    }, 600);
  };

  const reset = () => {
    spinReset();
    setColor(DEFAULTS.color);
    setColorKind("strawberry");
    setCustomColor(CUSTOM_DEFAULT);
    setStiffness(DEFAULTS.stiffness);
    setDamping(DEFAULTS.damping);
    setVolume(DEFAULTS.volume);
    lastStiffness.current = DEFAULTS.stiffness;
    lastDamping.current = DEFAULTS.damping;
    lastVolume.current = DEFAULTS.volume;
    expRef.current?.setStiffness(DEFAULTS.stiffness / 100);
    expRef.current?.setDamping(DEFAULTS.damping / 100);
    sound.setVolume(DEFAULTS.volume / 100);
    setSoundOn(sound.enabled);
    sound.playBounce(0.8);
    sound.playHappyPurr();
    expRef.current?.reset(DEFAULTS.color);
  };

  const errorMessage = t[errorKey];
  const swatchSelected = (kind: ColorKind) => colorKind === kind;
  const rangeStyle = (value: number) => ({ "--value": `${value}%` }) as CSSProperties;

  return (
    <div
      className="softie-root"
      lang={locale === "en" ? "en" : "zh-CN"}
      data-locale={locale === "en" ? "en" : "zh"}
      style={{ "--accent": color } as CSSProperties}
    >
      <div
        className={`preloader${loadingDone && status !== "pending" ? " is-done" : ""}`}
        role="status"
        aria-live="polite"
        hidden={status === "error"}
      >
        <div className="preloader-inner">
          <div className="preloader-slime-wrap">
            <svg className="preloader-slime" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <defs>
                <linearGradient
                  id="loading-slime-fill"
                  x1="24"
                  y1="5"
                  x2="24"
                  y2="43"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#ffd5e5" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#f17fa9" stopOpacity="0.8" />
                </linearGradient>
              </defs>
              <path
                className="preloader-slime-body"
                d="M24 5c-5.9 0-6.3 7.2-10.3 9.8C7.6 18.7 5 24.2 5 30.3 5 38.8 12.6 43 24 43s19-4.2 19-12.7c0-6.1-2.6-11.6-8.7-15.5C30.3 12.2 29.9 5 24 5Z"
                stroke="#221d20"
                strokeWidth="2.4"
                strokeLinejoin="round"
                fill="url(#loading-slime-fill)"
              />
              <circle cx="13.2" cy="31.2" r="2.4" fill="#f87aa5" opacity="0.6" />
              <circle cx="34.8" cy="31.2" r="2.4" fill="#f87aa5" opacity="0.6" />
              <g className="preloader-eyes">
                <circle className="preloader-eye preloader-eye-left" cx="17.2" cy="27.8" r="2.3" fill="#221d20" />
                <circle cx="18" cy="27" r="0.75" fill="#ffffff" />
                <circle className="preloader-eye preloader-eye-right" cx="30.8" cy="27.8" r="2.3" fill="#221d20" />
                <circle cx="31.6" cy="27" r="0.75" fill="#ffffff" />
              </g>
              <path
                className="preloader-mouth"
                d="M21.2 31.5q2.8 3.2 5.6 0"
                stroke="#221d20"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
            <div className="preloader-shadow" aria-hidden="true" />
          </div>
          <div className="preloader-message">
            <p className="preloader-text">{t.loading}</p>
            <span className="preloader-pulse-bar" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="playground">
        <header className="masthead">
          <div className="wordmark" aria-hidden="true">
            <svg className="jelly-mark" width="44" height="44" viewBox="0 0 48 48" fill="none">
              <path
                d="M24 5c-5.9 0-6.3 7.2-10.3 9.8C7.6 18.7 5 24.2 5 30.3 5 38.8 12.6 43 24 43s19-4.2 19-12.7c0-6.1-2.6-11.6-8.7-15.5C30.3 12.2 29.9 5 24 5Z"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <circle cx="17.2" cy="28" r="2.2" fill="currentColor" />
              <circle cx="30.8" cy="28" r="2.2" fill="currentColor" />
              <path d="M21.2 31.5q2.8 3 5.6 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>softie</span>
          </div>
          <div className="masthead-tools">
            <p className="masthead-note">
              {locale === "en" ? "A LITTLE ROOM TO PLAY" : "留一点空间，放轻松"}
            </p>
            <button
              className="sound-toggle"
              type="button"
              aria-pressed={soundOn}
              aria-label={t.soundToggle}
              title={soundOn ? t.soundOn : t.soundOff}
              onClick={() => {
                const enabled = sound.toggle();
                setSoundOn(enabled);
                setVolume(Math.round(sound.volume * 100));
              }}
            >
              <svg
                className="sound-icon sound-icon-on"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <svg
                className="sound-icon sound-icon-off"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
              </svg>
            </button>
          </div>
        </header>

        <section className="intro" aria-labelledby="softie-title">
          <div className="intro-text">
            <h1 id="softie-title">{t.heading}</h1>
            <p>{t.intro}</p>
          </div>
          <button
            className="stage-reset-btn"
            type="button"
            data-action="reset"
            aria-label={t.reset}
            title={t.reset}
            disabled={!controlsOn}
            onClick={reset}
          >
            <svg
              ref={resetIconRef}
              className="reset-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span className="sr-only">{t.reset}</span>
          </button>
        </section>

        <div
          ref={stageRef}
          className="stage"
          data-interaction={interaction}
          aria-busy={status === "pending"}
        >
          <canvas
            ref={canvasRef}
            className="slime-canvas"
            tabIndex={0}
            aria-label={t.canvas}
            aria-describedby="softie-help"
          />
          <button
            className="poke-button stage-poke-btn"
            type="button"
            title={t.pokeTitle}
            disabled={!controlsOn}
            onClick={() => expRef.current?.poke()}
          >
            <span>{t.poke}</span>
            <span className="sparkle" aria-hidden="true">
              ✦
            </span>
          </button>
          {status === "error" && (
            <div className="stage-message stage-error" role="alert">
              <h2>{t.waiting}</h2>
              <p>{errorMessage}</p>
            </div>
          )}
        </div>

        <p id="softie-help" className="interaction-hint">
          <span>{t.hold}</span>
          <span className="separator" aria-hidden="true">
            ·
          </span>
          <span>{t.drag}</span>
          <span className="separator" aria-hidden="true">
            ·
          </span>
          <span>{t.release}</span>
        </p>

        <aside className="settings" aria-labelledby="softie-settings-title">
          <div className="settings-heading">
            <h2 id="softie-settings-title">{t.settings}</h2>
            <p>{t.settingsNote}</p>
          </div>
          <fieldset disabled={!controlsOn}>
            <legend className="sr-only">{t.settingsLabel}</legend>
            <div className="color-control">
              <div className="control-heading color-heading">
                <span id="softie-color-label" className="control-label">
                  {t.color}
                </span>
                <p className="color-name" aria-live="polite">
                  {colorName}
                </p>
              </div>
              <div className="swatches" role="group" aria-labelledby="softie-color-label">
                {PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    className={`swatch${swatchSelected(preset.name) ? " is-selected" : ""}`}
                    type="button"
                    aria-label={t[`${preset.name}Label`]}
                    aria-pressed={swatchSelected(preset.name)}
                    style={{ "--swatch": preset.color } as CSSProperties}
                    onClick={() => applyColor(preset.color, preset.name, preset.pitch)}
                  >
                    <span />
                  </button>
                ))}
                <label
                  className={`swatch swatch-custom${swatchSelected("custom") ? " is-selected" : ""}`}
                  aria-label={t.customLabel}
                  aria-pressed={swatchSelected("custom")}
                  title={t.customLabel}
                  style={{ "--swatch": customColor } as CSSProperties}
                >
                  <input
                    type="color"
                    className="custom-color-input"
                    value={customColor}
                    aria-label={t.customLabel}
                    onInput={event => {
                      const next = event.currentTarget.value;
                      setCustomColor(next);
                      setColor(next);
                      setColorKind("custom");
                      expRef.current?.setColor(next);
                    }}
                    onChange={event => {
                      const next = event.currentTarget.value;
                      setCustomColor(next);
                      applyColor(next, "custom", 1.15);
                    }}
                  />
                  <span />
                </label>
              </div>
            </div>

            <div className="range-control">
              <div className="control-heading">
                <label htmlFor="softie-stiffness">{t.stiffness}</label>
                <output id="softie-stiffness-value" htmlFor="softie-stiffness">
                  {stiffness}
                </output>
              </div>
              <input
                id="softie-stiffness"
                type="range"
                min={0}
                max={100}
                value={stiffness}
                step={1}
                style={rangeStyle(stiffness)}
                aria-describedby="softie-stiffness-description"
                onInput={event =>
                  onRange("stiffness", Number(event.currentTarget.value), lastStiffness)
                }
              />
              <div id="softie-stiffness-description" className="range-description">
                <span>{t.soft}</span>
                <span>{t.springy}</span>
              </div>
            </div>

            <div className="range-control">
              <div className="control-heading">
                <label htmlFor="softie-damping">{t.damping}</label>
                <output id="softie-damping-value" htmlFor="softie-damping">
                  {damping}
                </output>
              </div>
              <input
                id="softie-damping"
                type="range"
                min={0}
                max={100}
                value={damping}
                step={1}
                style={rangeStyle(damping)}
                aria-describedby="softie-damping-description"
                onInput={event =>
                  onRange("damping", Number(event.currentTarget.value), lastDamping)
                }
              />
              <div id="softie-damping-description" className="range-description">
                <span>{t.wobbly}</span>
                <span>{t.settled}</span>
              </div>
            </div>

            <div className="range-control">
              <div className="control-heading">
                <label htmlFor="softie-volume">{t.volume}</label>
                <output id="softie-volume-value" htmlFor="softie-volume">
                  {volume}%
                </output>
              </div>
              <input
                id="softie-volume"
                type="range"
                min={0}
                max={100}
                value={volume}
                step={1}
                style={rangeStyle(volume)}
                aria-describedby="softie-volume-description"
                onInput={event => onVolume(Number(event.currentTarget.value))}
              />
              <div id="softie-volume-description" className="range-description">
                <span>{t.volumeMute}</span>
                <span>{t.volumeMax}</span>
              </div>
            </div>

            <div className="actions">
              <button
                className="poke-button"
                type="button"
                title={t.pokeTitle}
                disabled={!controlsOn}
                onClick={() => expRef.current?.poke()}
              >
                <span>{t.poke}</span>
                <span className="sparkle" aria-hidden="true">
                  ✦
                </span>
              </button>
              <button
                className="reset-button"
                type="button"
                disabled={!controlsOn}
                onClick={reset}
              >
                {t.reset}
              </button>
            </div>
          </fieldset>
        </aside>

        <footer className="page-footer">
          <p className="footer-note">{t.footer}</p>
        </footer>
      </div>
    </div>
  );
}
