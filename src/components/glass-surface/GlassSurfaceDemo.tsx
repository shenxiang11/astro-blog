import GlassSurface from "./GlassSurface";
import summerUrl from "@/assets/glass-surface/summer.jpg?url";
import contentUrl from "@/assets/glass-surface/content.jpg?url";
import fallbackUrl from "@/assets/glass-surface/fallback.jpg?url";

const SHOTS = [
  { src: summerUrl, text: "The Summer Of Glass" },
  { src: contentUrl, text: "Can Hold Any Content" },
  { src: fallbackUrl, text: "Has Built-In Fallback" },
] as const;

const glassProps = {
  borderRadius: 50,
  borderWidth: 0.07,
  brightness: 50,
  opacity: 0.93,
  blur: 11,
  displace: 0.5,
  backgroundOpacity: 0.1,
  saturation: 1,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
} as const;

export function GlassSurfaceDemo() {
  return (
    <div className="gs-demo">
      <p className="gs-hint">向下滚动</p>

      <GlassSurface
        className="gs-lens"
        width="min(360px, 90vw)"
        height={100}
        {...glassProps}
      />

      <div className="gs-shots">
        {SHOTS.map(shot => (
          <figure key={shot.text} className="gs-shot">
            <img src={shot.src} alt="" />
            <figcaption className="gs-shot-text">{shot.text}</figcaption>
            <span className="gs-shot-text-ghost">{shot.text}</span>
          </figure>
        ))}
      </div>
    </div>
  );
}
