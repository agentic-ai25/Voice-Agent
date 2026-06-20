'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

/**
 * Traveling border-line styling — change these to tweak the moving green line.
 * - color:        any CSS color for the line + glow
 * - speedSeconds: time for one full lap around the pill (smaller = faster)
 * - dashLength:   % of the perimeter that is lit (bigger = longer streak)
 * - lineWidth:    crisp line thickness (px)
 * - glowWidth:    soft glow thickness (px)
 * - glowBlur:     glow blur radius (px)
 * - glowOpacity:  glow strength, 0–1
 * - brightness:   bloom around the crisp line (0 = none, higher = brighter)
 * - cornerFade:   brightness at the rounded ends (0 = invisible at corners, 1 = even)
 */
export const BORDER_LINE = {
  color: '#22c55e',
  speedSeconds: 5,
  dashLength: 30,
  lineWidth: 2.25,
  glowWidth: 6,
  glowBlur: 3,
  glowOpacity: 1,
  brightness: 2,
  cornerFade: 0.3,
};

/**
 * A bright green line segment that travels along the rounded boundary of its
 * positioned parent. Drop it inside any relative/fixed pill container; it
 * measures itself so the corner radius matches the pill (a true stadium).
 */
export function BorderLine() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [radius, setRadius] = useState(28);
  const gradId = `lk-border-grad-${useId().replace(/:/g, '')}`;

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (el) {
      setRadius(el.clientHeight / 2);
    }
  }, []);

  const dash = `${BORDER_LINE.dashLength} ${100 - BORDER_LINE.dashLength}`;
  const spin = {
    animate: { strokeDashoffset: [0, -100] },
    transition: { duration: BORDER_LINE.speedSeconds, ease: 'linear' as const, repeat: Infinity },
  };

  return (
    <svg
      ref={svgRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible"
    >
      {/* Horizontal fade: dim at the left/right extremes (the rounded ends)
          and bright in the middle (the straight top/bottom edges). */}
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={BORDER_LINE.color} stopOpacity={BORDER_LINE.cornerFade} />
          <stop offset="50%" stopColor={BORDER_LINE.color} stopOpacity={1} />
          <stop offset="100%" stopColor={BORDER_LINE.color} stopOpacity={BORDER_LINE.cornerFade} />
        </linearGradient>
      </defs>
      {/* soft glow underlay */}
      <motion.rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx={radius}
        ry={radius}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={BORDER_LINE.glowWidth}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
        style={{ filter: `blur(${BORDER_LINE.glowBlur}px)`, opacity: BORDER_LINE.glowOpacity }}
        {...spin}
      />
      {/* crisp bright line */}
      <motion.rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx={radius}
        ry={radius}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={BORDER_LINE.lineWidth}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
        style={
          BORDER_LINE.brightness
            ? { filter: `drop-shadow(0 0 ${4 * BORDER_LINE.brightness}px ${BORDER_LINE.color})` }
            : undefined
        }
        {...spin}
      />
    </svg>
  );
}
