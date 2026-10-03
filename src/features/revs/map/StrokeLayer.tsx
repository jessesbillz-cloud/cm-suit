// The marks over the sheet: an SVG on the page's layout box, viewBox 0 0 1 aspect (x and y are page fractions).
import { memo } from 'react';
import { HIGHLIGHT_OPACITY, MARKUP_COLORS, strokePath, type MarkupColor, type Stroke } from '../../../lib/markup';

interface StrokeLayerProps {
  strokes: readonly Stroke[];
  aspect: number;
}

/** Saved marks. Memoized: panning and zooming move the box, they don't redraw the marks. */
export const StrokeLayer = memo(function StrokeLayer({ strokes, aspect }: StrokeLayerProps) {
  return (
    <svg
      viewBox={`0 0 1 ${String(aspect)}`}
      preserveAspectRatio="none"
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {strokes.map((s, i) => (
        <path
          // Strokes are only ever added at the end or taken off the end, so the index is stable.
          key={i}
          d={strokePath(s.p, aspect)}
          fill="none"
          stroke={MARKUP_COLORS[s.c]}
          strokeOpacity={HIGHLIGHT_OPACITY}
          strokeWidth={s.w}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
});

interface LiveStrokeProps {
  points: readonly [number, number][];
  color: MarkupColor;
  width: number;
  aspect: number;
}

/** The stroke under the finger, before it is saved. A single point shows as a dot. */
export function LiveStroke({ points, color, width, aspect }: LiveStrokeProps) {
  const first = points[0];
  const path = points.length === 1 && first ? [first, first] : points;
  return (
    <svg viewBox={`0 0 1 ${String(aspect)}`} preserveAspectRatio="none" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
      <path
        d={strokePath(path, aspect)}
        fill="none"
        stroke={MARKUP_COLORS[color]}
        strokeOpacity={HIGHLIGHT_OPACITY}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
