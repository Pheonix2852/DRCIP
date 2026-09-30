import { useEffect, useRef, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

interface MaskContainerProps {
  children?: ReactNode;
  revealText?: ReactNode;
  className?: string;

  /** Mask diameter in pixels when idle. */
  size?: number;

  /** Mask diameter in pixels while hovered. */
  revealSize?: number;
}

export function MaskContainer({ children, revealText, className, size = 0, revealSize = 520 }: MaskContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  /*
   * Pointer position:
   * MotionValues update without React rerenders.
   */
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  const x = useSpring(rawX, {
    stiffness: 700,
    damping: 45,
    mass: 0.15,
  });

  const y = useSpring(rawY, {
    stiffness: 700,
    damping: 45,
    mass: 0.15,
  });

  /*
   * Mask size:
   * 0px when idle.
   * revealSize when hovered.
   */
  const maskSize = useMotionValue(size);

  const smoothMaskSize = useSpring(maskSize, {
    stiffness: 650,
    damping: 42,
    mass: 0.15,
  });

  /*
   * Keep the circular mask centered on the cursor.
   */
  const maskPosition = useTransform(
    [x, y, smoothMaskSize],
    ([currentX, currentY, currentSize]) =>
      `${Number(currentX) - Number(currentSize) / 2}px ${Number(currentY) - Number(currentSize) / 2}px`,
  );

  const maskSizeValue = useTransform(smoothMaskSize, (value) => `${value}px`);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || reduceMotion) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();

      rawX.set(event.clientX - rect.left);
      rawY.set(event.clientY - rect.top);
    };

    container.addEventListener("pointermove", handlePointerMove);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
    };
  }, [rawX, rawY, reduceMotion]);

  const handlePointerEnter = () => {
    if (reduceMotion) return;

    maskSize.set(revealSize);
  };

  const handlePointerLeave = () => {
    if (reduceMotion) return;

    maskSize.set(0);
  };

  /*
   * Reduced-motion users get the revealed state immediately.
   */
  useEffect(() => {
    if (reduceMotion) {
      maskSize.set(revealSize);
    }
  }, [maskSize, reduceMotion, revealSize]);

  return (
    <div
      ref={containerRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={cn("relative h-full w-full overflow-hidden", className)}
    >
      {/*
       * MASKED / REVEALED LAYER
       *
       * This layer sits above the base image.
       * The actual content inside it is supplied by `children`.
       */}
      <motion.div
        className="absolute inset-0 z-10 overflow-hidden"
        aria-hidden="true"
        style={{
          WebkitMaskImage: "url(/mask.svg)",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: maskPosition,
          WebkitMaskSize: maskSizeValue,

          maskImage: "url(/mask.svg)",
          maskRepeat: "no-repeat",
          maskPosition: maskPosition,
          maskSize: maskSizeValue,
        }}
      >
        {children}
      </motion.div>

      {/*
       * BASE / ALWAYS-VISIBLE LAYER
       */}
      <div className="relative z-0 h-full w-full">{revealText}</div>
    </div>
  );
}
