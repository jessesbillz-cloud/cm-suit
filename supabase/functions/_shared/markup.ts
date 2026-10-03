// Sheet markup for OSFM inspection maps (Revs, migration 0056): the three highlighter colors, the stroke shape and the
// map's title. ONE definition shared by the browser (src/lib/markup.ts re-exports it for the sheet viewer and the
// request form's title preview) and the map PDF (pdf/irMap.ts), so the screen and the printed map never disagree. Pure,
// no imports.

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

export interface MapTitleInput {
  /** The IR number; a word (e.g. "new") on a request the database hasn't numbered yet. */
  number: number | string;
  /** The OFS IR number (null: none); a word on a request not numbered yet. */
  ofsNumber: number | string | null;
  phase: string | null;
  /** yyyy-MM-dd, the request's day. */
  requestDate: string;
  what: string;
}

/** "OFS IR #0065"; a word in place of the number on a request not numbered yet. */
export function ofsIrLabel(n: number | string): string {
  return `OFS IR #${typeof n === 'number' ? String(n).padStart(4, '0') : n}`;
}

/** OSFM's title on every map: "IR 377 - OFS IR #0065 - PH III - 2026-10-05 - Level 02 Cavity Stuffing". */
export function mapTitle(t: MapTitleInput): string {
  return [
    `IR ${String(t.number)}`,
    t.ofsNumber === null ? '' : ofsIrLabel(t.ofsNumber),
    t.phase?.trim() ?? '',
    t.requestDate,
    t.what.trim(),
  ].filter((part) => part !== '').join(' - ');
}

/** A stroke kept inside the page and inside the width limits. */
export function clampStroke(s: Stroke): Stroke {
  return {
    c: s.c,
    w: Math.min(STROKE_LIMITS.maxWidth, Math.max(STROKE_LIMITS.minWidth, s.w)),
    p: s.p.map(([x, y]): [number, number] => [clamp01(x), clamp01(y)]),
  };
}
