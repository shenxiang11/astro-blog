import type { CSSProperties } from "react";

const STRIP_COUNT = 18;
const SPAN = 0.5;
const BETA = 0.6;

export type CurlDir = "next" | "prev";

type PaperCurlProps = {
  dir: CurlDir;
  fromSrc: string;
  toSrc: string;
  t: number;
  bookWidth: number;
  bookHeight: number;
};

export function curlAngles(t: number) {
  const theta = Math.PI * t;
  const beta = BETA * Math.sin(Math.PI * t);
  const turn = theta + beta;
  const delta = (2 * beta) / STRIP_COUNT;
  return {
    turnDeg: (turn * 180) / Math.PI,
    deltaDeg: (delta * 180) / Math.PI,
    shade: Math.sin(Math.PI * t),
    turn,
    delta,
  };
}

function Strip({
  index,
  dir,
  fromSrc,
  toSrc,
  bookWidth,
  turn,
  delta,
}: {
  index: number;
  dir: CurlDir;
  fromSrc: string;
  toSrc: string;
  bookWidth: number;
  turn: number;
  delta: number;
}) {
  const gutter = bookWidth * 0.5;
  const stripWidth = (bookWidth * SPAN) / STRIP_COUNT;
  const fromOffset = -(gutter + index * stripWidth);
  const toOffset = (index + 1) * stripWidth - gutter;
  const frontX = dir === "next" ? fromOffset : toOffset;
  const backX = dir === "next" ? toOffset : fromOffset;
  const near = Math.abs(Math.cos(turn - index * delta));
  const far = Math.abs(Math.cos(turn - (index + 1) * delta));

  return (
    <div
      className={`sh-strip${index === STRIP_COUNT - 1 ? " is-edge" : ""}`}
      style={
        {
          "--i": String(index),
          "--lit": near.toFixed(3),
          "--a1": ((1 - near) * 0.62).toFixed(3),
          "--a2": ((1 - far) * 0.62).toFixed(3),
        } as CSSProperties
      }
    >
      <div className="sh-face front">
        <img
          src={fromSrc}
          alt=""
          draggable={false}
          style={{ left: frontX }}
        />
        <span className="sh-face-shade" />
        <span className="sh-face-glint" />
      </div>
      <div className="sh-face back">
        <img
          src={toSrc}
          alt=""
          draggable={false}
          style={{ left: backX }}
        />
        <span className="sh-face-shade" />
        <span className="sh-face-glint" />
      </div>
      {index < STRIP_COUNT - 1 && (
        <Strip
          index={index + 1}
          dir={dir}
          fromSrc={fromSrc}
          toSrc={toSrc}
          bookWidth={bookWidth}
          turn={turn}
          delta={delta}
        />
      )}
    </div>
  );
}

export default function PaperCurl({
  dir,
  fromSrc,
  toSrc,
  t,
  bookWidth,
  bookHeight,
}: PaperCurlProps) {
  const { turnDeg, deltaDeg, shade, turn, delta } = curlAngles(t);

  return (
    <div
      className={`sh-curl ${dir}`}
      style={
        {
          "--n": STRIP_COUNT,
          "--span": SPAN,
          "--bw": `${bookWidth}px`,
          "--bh": bookHeight ? `${bookHeight}px` : "100%",
          "--tt": `${turnDeg.toFixed(2)}deg`,
          "--td": `${deltaDeg.toFixed(3)}deg`,
          "--shade": shade.toFixed(3),
        } as CSSProperties
      }
    >
      <Strip
        index={0}
        dir={dir}
        fromSrc={fromSrc}
        toSrc={toSrc}
        bookWidth={bookWidth}
        turn={turn}
        delta={delta}
      />
    </div>
  );
}
