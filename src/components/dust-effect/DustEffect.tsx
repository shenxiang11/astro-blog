import { useEffect, useRef, useState } from "react";
import { getDemoUi } from "@/i18n/demoUi";
import photoUrl from "@/assets/shanghai/yu-garden.png?url";
import { DustEngine } from "./engine";

type Phase = "idle" | "playing" | "done" | "unsupported";

export default function DustEffect({ locale }: { locale?: string }) {
  const ui = getDemoUi(locale);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const engineRef = useRef<DustEngine | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = DustEngine.create(canvas);
    if (!engine) {
      setPhase("unsupported");
      return;
    }
    engineRef.current = engine;
    engine.onFinished = () => setPhase("done");
    const resize = () => engine.resize();
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const play = () => {
    if (phase !== "idle") return;
    const engine = engineRef.current;
    const photo = photoRef.current;
    const canvas = canvasRef.current;
    if (!photo || !canvas) return;

    if (
      !engine ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setPhase("done");
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const photoRect = photo.getBoundingClientRect();
    engine.burst({
      image: photo,
      originX: photoRect.left - canvasRect.left,
      originY: photoRect.top - canvasRect.top,
      width: photoRect.width,
      height: photoRect.height,
      radius: 16,
    });
    setPhase("playing");
  };

  const replay = () => {
    engineRef.current?.stop();
    setPhase("idle");
  };

  const spent = phase === "playing" || phase === "done";

  return (
    <div className="dust-demo">
      <div className={`dust-stage${spent ? " is-spent" : ""}`}>
        <canvas ref={canvasRef} className="dust-canvas" aria-hidden="true" />
        <img
          ref={photoRef}
          className="dust-photo"
          src={photoUrl}
          alt=""
          draggable={false}
        />
        {phase === "idle" && (
          <button
            type="button"
            className="dust-hit"
            onClick={play}
            aria-label={ui.dustAria}
          />
        )}
        {phase === "done" && (
          <button type="button" className="dust-replay" onClick={replay}>
            {ui.dustReplay}
          </button>
        )}
      </div>
      {(phase === "idle" || phase === "unsupported") && (
        <p className="dust-hint">
          {phase === "unsupported" ? ui.dustUnsupported : ui.dustHint}
        </p>
      )}
    </div>
  );
}
