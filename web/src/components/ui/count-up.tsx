"use client";

import { useEffect, useRef, useState } from "react";
import { formatValue, type ValueFormat } from "@/lib/utils";

/** Animates a number from its previous value to the new one. */
export function CountUp({
  value,
  format = "number",
  duration = 850,
  className,
}: {
  value: number;
  format?: ValueFormat;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const frame = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    cancelAnimationFrame(frame.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (value - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration]);

  return <span className={className}>{formatValue(display, format)}</span>;
}
