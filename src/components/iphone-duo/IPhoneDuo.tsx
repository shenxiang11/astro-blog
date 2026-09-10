import { useEffect, useRef, useState } from "react";
import { getDemoUi } from "@/i18n/demoUi";
import { DuoExperience, type DuoTheme } from "./experience";
import type { UIKind } from "./ui";

const asset = (path: string) => {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
};

const DEFAULT_CUSTOM = {
  inner: asset("iphone-duo/ui/custom-inner.png"),
  outer: asset("iphone-duo/ui/custom-outer.png"),
} as const;

export default function IPhoneDuo({ locale }: { locale?: string }) {
  const ui = getDemoUi(locale);
  const viewportRef = useRef<HTMLDivElement>(null);
  const innerInputRef = useRef<HTMLInputElement>(null);
  const outerInputRef = useRef<HTMLInputElement>(null);
  const expRef = useRef<DuoExperience | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [angle, setAngle] = useState(180);
  const [playing, setPlaying] = useState(false);
  const [theme, setTheme] = useState<DuoTheme>("wallpaper");
  const [previews, setPreviews] = useState(DEFAULT_CUSTOM);
  const previewsRef = useRef(previews);
  previewsRef.current = previews;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const experience = new DuoExperience(viewport, {
      onReady: () => setReady(true),
      onAngle: value => setAngle(value),
      onPlaying: value => setPlaying(value),
      onError: () => setFailed(true),
    });
    expRef.current = experience;
    return () => {
      experience.dispose();
      expRef.current = null;
      for (const src of Object.values(previewsRef.current)) {
        if (src.startsWith("blob:")) URL.revokeObjectURL(src);
      }
    };
  }, []);

  const pickTheme = (next: DuoTheme) => {
    setTheme(next);
    expRef.current?.showTheme(next);
  };

  const onCustom = async (kind: UIKind, file: File | undefined) => {
    if (!file || !expRef.current) return;
    try {
      await expRef.current.setCustomImage(kind, file);
      setTheme("custom");
      setPreviews(current => {
        const previous = current[kind];
        if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
        return { ...current, [kind]: URL.createObjectURL(file) };
      });
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className={theme === "custom" ? "duo-root is-custom" : "duo-root"}>
      <div
        ref={viewportRef}
        className="duo-viewport"
        aria-label={ui.duoOrbit}
      />
      {!ready && !failed && <p className="duo-status">{ui.duoLoading}</p>}
      {failed && <p className="duo-status">{ui.duoLoadError}</p>}

      <div className="duo-dock">
        <aside className="duo-screen" aria-label={ui.duoScreen}>
          <h2>{ui.duoScreen}</h2>
          <div className="duo-themes" role="tablist" aria-label={ui.duoScreen}>
            {(
              [
                ["wallpaper", ui.duoWallpaper],
                ["launcher", ui.duoLauncher],
                ["custom", ui.duoCustom],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                disabled={!ready}
                aria-selected={theme === id}
                onClick={() => pickTheme(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="duo-uploads"
            hidden={theme !== "custom"}
            aria-label={ui.duoCustomHint}
          >
            {(
              [
                ["inner", ui.duoCustomInner, ui.duoCustomInnerAria, innerInputRef, previews.inner],
                ["outer", ui.duoCustomOuter, ui.duoCustomOuterAria, outerInputRef, previews.outer],
              ] as const
            ).map(([kind, label, aria, inputRef, src]) => (
              <button
                key={kind}
                type="button"
                className="duo-upload"
                disabled={!ready}
                aria-label={aria}
                onClick={() => inputRef.current?.click()}
              >
                <img src={src} alt="" />
                <span>{label}</span>
              </button>
            ))}
            <input
              ref={innerInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={event => {
                void onCustom("inner", event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <input
              ref={outerInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={event => {
                void onCustom("outer", event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </aside>
        <section className="duo-controls" aria-label={ui.duoAria}>
          <button
            type="button"
            className="duo-play"
            disabled={!ready}
            aria-label={playing ? ui.duoPause : ui.duoPlay}
            onClick={() => expRef.current?.togglePlaying()}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 6v12M16 6v12" />
              </svg>
            ) : (
              <svg className="duo-play-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 5 10 7-10 7Z" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={180}
            step={0.1}
            disabled={!ready}
            value={angle}
            aria-label={ui.duoAria}
            style={{ ["--progress" as string]: `${angle / 1.8}%` }}
            onChange={event => {
              const next = Number(event.target.value);
              expRef.current?.setPlaying(false);
              expRef.current?.setAngle(next);
            }}
          />
        </section>
      </div>
    </div>
  );
}
