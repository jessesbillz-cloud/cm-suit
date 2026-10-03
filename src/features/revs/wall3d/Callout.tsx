// The callout for the focused part: a leader from a dot on the part to the label's shoulder, and the label itself as
// HTML over the drawing so its text stays readable at any width (a phone or a desktop) and wraps instead of running off.
import type { Slot } from './assembly';
import type { Placed } from './placeLabel';
import type { Box, Pt } from './iso';

const LINE = { vectorEffect: 'non-scaling-stroke' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** In the SVG: a white halo under a thin accent line from the part to the shoulder, the shoulder, and a dot on the part. */
export function Leader({ from, placed, slot }: { from: Pt; placed: Placed; slot: Slot }) {
  const [sx, sy] = placed.shoulder;
  const y = slot === 'top' ? placed.box.maxY : placed.box.minY;
  const d = `M${String(from[0])} ${String(from[1])}L${String(sx)} ${String(sy)}`;
  const shoulder = `M${String(placed.box.minX + 1)} ${String(y)}L${String(placed.box.maxX - 1)} ${String(y)}`;
  return (
    <g pointerEvents="none" data-testid="wall3d-leader">
      <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={4} {...LINE} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} {...LINE} />
      <path d={shoulder} fill="none" stroke="currentColor" strokeWidth={1.5} {...LINE} />
      <circle cx={from[0]} cy={from[1]} r={1.4} fill="currentColor" stroke="#FFFFFF" strokeWidth={1.5} {...LINE} />
    </g>
  );
}

interface CalloutLabelProps {
  text: string;
  placed: Placed;
  slot: Slot;
  view: Box;
}

/** The words, centered on the shoulder: above it when the label is over the wall, under it when below. */
export function CalloutLabel({ text, placed, slot, view }: CalloutLabelProps) {
  const w = view.maxX - view.minX;
  const h = view.maxY - view.minY;
  const pct = (n: number) => `${String(Math.round(n * 1000) / 10)}%`;
  const { box } = placed;
  const vertical = slot === 'top' ? { bottom: pct((view.maxY - box.maxY) / h) } : { top: pct((box.minY - view.minY) / h) };
  return (
    <p
      data-testid="wall3d-label"
      className={`pointer-events-none absolute break-words px-1 text-center text-[13px] font-semibold leading-[17px] text-accent ${
        slot === 'top' ? 'pb-1' : 'pt-1'
      }`}
      style={{ left: pct((box.minX - view.minX) / w), width: pct((box.maxX - box.minX) / w), ...vertical }}
    >
      {text}
    </p>
  );
}
