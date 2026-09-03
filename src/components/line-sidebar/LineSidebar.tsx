/* Ported from react-bits LineSidebar (MIT):
 * https://reactbits.dev/components/line-sidebar
 */
import { useState, type CSSProperties, type KeyboardEvent } from "react";

type Falloff = "linear" | "smooth" | "sharp";

export type LineSidebarMark = {
  src: string;
  alt: string;
  href?: string;
};

export type LineSidebarItem =
  | string
  | {
      label?: string;
      href?: string;
      marks?: LineSidebarMark[];
    };

export type LineSidebarProps = {
  items?: LineSidebarItem[];
  accentColor?: string;
  textColor?: string;
  markerColor?: string;
  hoverGradient?: string;
  showIndex?: boolean;
  showMarker?: boolean;
  proximityRadius?: number;
  maxShift?: number;
  falloff?: Falloff;
  markerLength?: number;
  markerGap?: number;
  tickScale?: number;
  scaleTick?: boolean;
  itemGap?: number;
  fontSize?: number;
  smoothing?: number;
  defaultActive?: number | null;
  stickyActive?: boolean;
  onItemClick?: (index: number, label: string) => void;
  className?: string;
};

const DEFAULT_ITEMS = [
  "Overview",
  "Components",
  "Animations",
  "Backgrounds",
  "Showcase",
  "Playground",
  "Templates",
  "Changelog",
  "Community",
  "Resources",
  "Documentation",
  "Support",
];

function resolveItem(item: LineSidebarItem) {
  if (typeof item === "string") {
    return { label: item, href: undefined, marks: [] as LineSidebarMark[] };
  }
  return {
    label: item.label ?? "",
    href: item.href,
    marks: item.marks ?? [],
  };
}

const LEADING_EMOJI_RE =
  /^(\p{Extended_Pictographic}(?:\p{Emoji_Modifier})?(?:\uFE0F)?(?:\u200D(?:\p{Extended_Pictographic}(?:\p{Emoji_Modifier})?(?:\uFE0F)?))*)\s*/u;

function splitLeadingEmoji(label: string) {
  const match = label.match(LEADING_EMOJI_RE);
  if (!match) return { emoji: "", text: label };
  return { emoji: match[1], text: label.slice(match[0].length) };
}

function LabelParts({ label }: { label: string }) {
  const { emoji, text } = splitLeadingEmoji(label);
  if (!emoji && !text) return null;
  return (
    <span className="line-sidebar__lead">
      {emoji ? <span className="line-sidebar__emoji">{emoji}</span> : null}
      {text ? <span className="line-sidebar__copy">{text}</span> : null}
    </span>
  );
}

function Marks({ marks }: { marks: LineSidebarMark[] }) {
  return marks.map(mark => {
    const image = (
      <img
        className="line-sidebar__mark-image"
        src={mark.src}
        alt={mark.alt}
      />
    );
    return mark.href ? (
      <a
        key={`${mark.alt}-${mark.src}`}
        className="line-sidebar__mark"
        href={mark.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={mark.alt}
      >
        {image}
      </a>
    ) : (
      <span key={`${mark.alt}-${mark.src}`} className="line-sidebar__mark">
        {image}
      </span>
    );
  });
}

export default function LineSidebar({
  items = DEFAULT_ITEMS,
  accentColor = "#A855F7",
  textColor = "#c4c4c4",
  markerColor = "#6c6c6c",
  hoverGradient = "linear-gradient(90deg, #FF3E3E 0%, #FFD549 40%, var(--foreground) 60%, #3C9AFF 100%)",
  showIndex = true,
  showMarker = true,
  maxShift = 40,
  markerLength = 20,
  markerGap = 10,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 50,
  fontSize,
  smoothing = 320,
  defaultActive = null,
  stickyActive = true,
  onItemClick,
  className = "",
}: LineSidebarProps) {
  const [activeIndex, setActiveIndex] = useState(defaultActive);

  const handleClick = (index: number, label: string) => {
    if (stickyActive) setActiveIndex(index);
    onItemClick?.(index, label);
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLLIElement>,
    index: number,
    label: string
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick(index, label);
    }
  };

  const style = {
    "--accent-color": accentColor,
    "--text-color": textColor,
    "--marker-color": markerColor,
    "--hover-gradient": hoverGradient,
    "--marker-length": `${markerLength}px`,
    "--marker-gap": `${markerGap}px`,
    "--tick-scale": tickScale,
    "--max-shift": `${maxShift}px`,
    "--item-gap": `${itemGap}px`,
    "--smoothing": `${smoothing}ms`,
    ...(typeof fontSize === "number"
      ? { "--font-size": `${fontSize}rem` }
      : {}),
  } as CSSProperties;

  return (
    <nav
      className={`line-sidebar${showMarker ? " line-sidebar--markers" : ""}${scaleTick ? " line-sidebar--scale-tick" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      <ul className="line-sidebar__list">
        {items.map((item, index) => {
          const { label, href, marks } = resolveItem(item);
          const isActive = activeIndex === index;
          const hasMarks = marks.length > 0;
          const rowLabel = label || marks.map(mark => mark.alt).join(" ");
          const isPlainRow = !href && !hasMarks;
          return (
            <li
              key={`${rowLabel}-${index}`}
              className="line-sidebar__item"
              aria-current={isActive ? "true" : undefined}
              onClick={() => handleClick(index, rowLabel)}
              onKeyDown={
                isPlainRow
                  ? e => handleKeyDown(e, index, rowLabel)
                  : undefined
              }
              role={isPlainRow ? "button" : undefined}
              tabIndex={isPlainRow ? 0 : undefined}
            >
              {showMarker && (
                <span className="line-sidebar__marker" aria-hidden="true" />
              )}
              <span className="line-sidebar__label">
                {showIndex && (
                  <span className="line-sidebar__index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                )}
                {href && !hasMarks ? (
                  <a className="line-sidebar__text" href={href}>
                    <LabelParts label={label} />
                  </a>
                ) : (
                  <span className="line-sidebar__text">
                    <LabelParts label={label} />
                    <Marks marks={marks} />
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
