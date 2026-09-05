import { useEffect, useRef, useState } from "react";
import { S65Experience } from "./experience";
import { PAINTS, type PaintId } from "./colors";
import { S65_SPEED_PATH, S65_SPEED_VIEWBOX } from "./speedPath";
import { getDemoUi } from "@/i18n/demoUi";

const asset = (path: string) => {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
};

export default function S65({ locale }: { locale?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const expRef = useRef<S65Experience | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [paintId, setPaintId] = useState<PaintId>("00");
  const [muted, setMuted] = useState(false);
  const [rushing, setRushing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let experience: S65Experience | null = null;
    try {
      experience = new S65Experience(canvas, {
        onProgress: value => setProgress(value),
        onReady: () => setReady(true),
        onRushing: value => setRushing(value),
      });
      expRef.current = experience;
    } catch (error) {
      console.error("[s65] webgl init failed", error);
    }
    return () => {
      experience?.dispose();
      expRef.current = null;
    };
  }, []);

  const changePaint = (id: PaintId) => {
    setPaintId(id);
    expRef.current?.setPaint(id);
  };

  const pct = Math.min(100, Math.round(progress * 100));

  return (
    <div className="s65-root">
      <div className="webgl-wrapper">
        <canvas ref={canvasRef} className="webgl-canvas" />
      </div>

      {!ready && (
        <aside id="preloader">
          <div className="progress-bar">
            <svg className="progress-bar-svg" viewBox={S65_SPEED_VIEWBOX} fill="none">
              <path className="speed-line-bg" d={S65_SPEED_PATH} />
              <path className="speed-line" id="process" d={S65_SPEED_PATH} />
              <defs>
                <linearGradient id="linear_0" x1="0.15%" y1="50%" x2="99.85%" y2="50%" gradientUnits="objectBoundingBox">
                  <stop offset="0" stopColor="#000000" stopOpacity="0" />
                  <stop offset={0.2341 * (pct / 100)} stopColor="#FFFFFF" stopOpacity="0.44" />
                  <stop offset={0.5278 * (pct / 100)} stopColor="#FFFFFF" stopOpacity="1" />
                  <stop offset={0.7698 * (pct / 100)} stopColor="#FFFFFF" stopOpacity="0.49" />
                  <stop offset={pct / 100} stopColor="#000000" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <div className="progress-num">{pct}%</div>
          </div>
        </aside>
      )}

      {ready && (
        <>
          <div className="Mute-container">
            <div
              className="Mute-content"
              onClick={() => {
                const next = !muted;
                setMuted(next);
                expRef.current?.setMuted(next);
              }}
            >
              <img src={asset(`s65/icon/${muted ? "close.webp" : "open.webp"}`)} alt="" />
            </div>
          </div>

          {!rushing && (
            <div className="ColorBar-container">
              <div className="ColorBar-content">
                {PAINTS.map(paint => (
                  <div
                    key={paint.id}
                    className="Bar"
                    style={{ backgroundImage: `url(${asset(`s65/icon/${paint.swatch}`)})` }}
                    onClick={() => changePaint(paint.id)}
                  >
                    {paintId === paint.id && <div className="Bar-Line" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!rushing && <p className="s65-hint">{getDemoUi(locale).s65Hint}</p>}
        </>
      )}
    </div>
  );
}
