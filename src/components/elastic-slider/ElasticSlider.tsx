/* Ported from react-bits ElasticSlider (MIT):
 * https://reactbits.dev/components/elastic-slider
 */
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getDemoUi } from "@/i18n/demoUi";

const MAX_OVERFLOW = 50;

export type ElasticSliderProps = {
  defaultValue?: number;
  startingValue?: number;
  maxValue?: number;
  className?: string;
  isStepped?: boolean;
  stepSize?: number;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  ariaLabel?: string;
};

function VolumeDownIcon() {
  return (
    <svg className="es-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 9v6h4l5 5V4L9 9H5zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  );
}

function VolumeUpIcon() {
  return (
    <svg className="es-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

export default function ElasticSlider({
  defaultValue = 50,
  startingValue = 0,
  maxValue = 100,
  className = "",
  isStepped = false,
  stepSize = 1,
  leftIcon = <VolumeDownIcon />,
  rightIcon = <VolumeUpIcon />,
  ariaLabel = "Volume",
}: ElasticSliderProps) {
  return (
    <div className={`es-container ${className}`.trim()}>
      <Slider
        defaultValue={defaultValue}
        startingValue={startingValue}
        maxValue={maxValue}
        isStepped={isStepped}
        stepSize={stepSize}
        leftIcon={leftIcon}
        rightIcon={rightIcon}
        ariaLabel={ariaLabel}
      />
    </div>
  );
}

function Slider({
  defaultValue,
  startingValue,
  maxValue,
  isStepped,
  stepSize,
  leftIcon,
  rightIcon,
  ariaLabel,
}: Required<Omit<ElasticSliderProps, "className">>) {
  const [value, setValue] = useState(defaultValue);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<"left" | "middle" | "right">("middle");
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useMotionValueEvent(clientX, "change", latest => {
    if (sliderRef.current) {
      const { left, right } = sliderRef.current.getBoundingClientRect();
      let newValue: number;

      if (latest < left) {
        setRegion("left");
        newValue = left - latest;
      } else if (latest > right) {
        setRegion("right");
        newValue = latest - right;
      } else {
        setRegion("middle");
        newValue = 0;
      }

      overflow.jump(decay(newValue, MAX_OVERFLOW));
    }
  });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0 && sliderRef.current) {
      const { left, width } = sliderRef.current.getBoundingClientRect();
      let newValue =
        startingValue + ((e.clientX - left) / width) * (maxValue - startingValue);

      if (isStepped) {
        newValue = Math.round(newValue / stepSize) * stepSize;
      }

      newValue = Math.min(Math.max(newValue, startingValue), maxValue);
      setValue(newValue);
      clientX.jump(e.clientX);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    handlePointerMove(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = () => {
    animate(overflow, 0, { type: "spring", bounce: 0.5 });
  };

  const getRangePercentage = () => {
    const totalRange = maxValue - startingValue;
    if (totalRange === 0) return 0;

    return ((value - startingValue) / totalRange) * 100;
  };

  const opacity = useTransform(scale, [1, 1.2], [0.7, 1]);
  const leftX = useTransform(() =>
    region === "left" ? -overflow.get() / scale.get() : 0
  );
  const rightX = useTransform(() =>
    region === "right" ? overflow.get() / scale.get() : 0
  );
  const scaleX = useTransform(() => {
    if (sliderRef.current) {
      const { width } = sliderRef.current.getBoundingClientRect();
      return 1 + overflow.get() / width;
    }
    return 1;
  });
  const scaleY = useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]);
  const transformOrigin = useTransform(() => {
    if (sliderRef.current) {
      const { left, width } = sliderRef.current.getBoundingClientRect();
      return clientX.get() < left + width / 2 ? "right" : "left";
    }
    return "left";
  });
  const trackHeight = useTransform(scale, [1, 1.2], [6, 12]);
  const trackMargin = useTransform(scale, [1, 1.2], [0, -3]);

  return (
    <>
      <motion.div
        onHoverStart={() => animate(scale, 1.2)}
        onHoverEnd={() => animate(scale, 1)}
        onTouchStart={() => animate(scale, 1.2)}
        onTouchEnd={() => animate(scale, 1)}
        style={{
          scale,
          opacity,
        }}
        className="es-wrapper"
      >
        <motion.div
          animate={{
            scale: region === "left" ? [1, 1.4, 1] : 1,
            transition: { duration: 0.25 },
          }}
          style={{ x: leftX }}
        >
          {leftIcon}
        </motion.div>

        <div
          ref={sliderRef}
          className="es-root"
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={startingValue}
          aria-valuemax={maxValue}
          aria-valuenow={Math.round(value)}
          aria-orientation="horizontal"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        >
          <motion.div
            style={{
              scaleX,
              scaleY,
              transformOrigin,
              height: trackHeight,
              marginTop: trackMargin,
              marginBottom: trackMargin,
            }}
            className="es-track-wrapper"
          >
            <div className="es-track">
              <div className="es-range" style={{ width: `${getRangePercentage()}%` }} />
            </div>
          </motion.div>
        </div>

        <motion.div
          animate={{
            scale: region === "right" ? [1, 1.4, 1] : 1,
            transition: { duration: 0.25 },
          }}
          style={{ x: rightX }}
        >
          {rightIcon}
        </motion.div>
      </motion.div>
      <p className="es-value">{Math.round(value)}</p>
    </>
  );
}

function decay(value: number, max: number) {
  if (max === 0) {
    return 0;
  }

  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);

  return sigmoid * max;
}

export function ElasticSliderDemo({ locale }: { locale?: string }) {
  const ui = getDemoUi(locale);
  return (
    <div className="es-demo">
      <h1 className="es-title">{ui.elasticTitle}</h1>
      <ElasticSlider
        leftIcon={<VolumeDownIcon />}
        rightIcon={<VolumeUpIcon />}
        startingValue={0}
        defaultValue={50}
        maxValue={100}
        isStepped
        stepSize={1}
        ariaLabel={ui.elasticAria}
      />
      <p className="es-hint">{ui.elasticHint}</p>
    </div>
  );
}
