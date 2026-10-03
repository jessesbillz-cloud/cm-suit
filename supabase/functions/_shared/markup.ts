// Sheet markup for OSFM inspection maps (Revs, migration 0056): the three highlighter colors and the stroke shape. ONE
// definition shared by the browser (src/lib/markup.ts re-exports it for the sheet viewer) and the map PDF
// (pdf/irMap.ts), so the screen and the printed map never disagree. Pure, no imports.

/** One color per inspected item; OSFM allows three at most on a sheet, never two alike. */
export const MARKUP_COLORS = { 1: '#16A34A', 2: '#2563EB', 3: '#DB2777' } as const;

export type MarkupColor = keyof typeof MARKUP_COLORS;

/** The highlighter look: every mark is drawn at this opacity, on screen and on the map. */
export const HIGHLIGHT_OPACITY = 0.45;

/**
 * A highlighter stroke as stored (ir_maps.strokes). x and y are fractions 0..1 of the sheet page as it is viewed (its
 * /Rotate applied), origin top-left; w is the stroke width as a fraction of the page width.
 */
export interface Stroke {
  c: MarkupColor;
  w: number;
  p: [number, number][];
}

/** What the database accepts (the strokes check in 0056). */
export const STROKE_LIMITS = { maxStrokes: 300, minPoints: 2, maxPoints: 2000, minWidth: 0.002, maxWidth: 0.05 } as const;

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** A stroke kept inside the page and inside the width limits. */
export function clampStroke(s: Stroke): Stroke {
  return {
    c: s.c,
    w: Math.min(STROKE_LIMITS.maxWidth, Math.max(STROKE_LIMITS.minWidth, s.w)),
    p: s.p.map(([x, y]): [number, number] => [clamp01(x), clamp01(y)]),
  };
}
