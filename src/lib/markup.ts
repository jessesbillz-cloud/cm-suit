// Highlighter marks on a plan sheet (Revs: OSFM inspection maps). The colors and the stroke shape are the ONE definition
// the map PDF uses too (supabase/functions/_shared/markup.ts); here, what the sheet viewer adds: finishing a drawn
// stroke (kept on the page, simplified well under the database's 2000 points) and the undo history.
import { clamp01, clampStroke, type MarkupColor, type Stroke } from '../../supabase/functions/_shared/markup';

export { HIGHLIGHT_OPACITY, MARKUP_COLORS, STROKE_LIMITS } from '../../supabase/functions/_shared/markup';
export type { MarkupColor, Stroke } from '../../supabase/functions/_shared/markup';

type Point = [number, number];

/** The highlighter's width as a fraction of the page width: about 1/8 in on a 36 in sheet, 1/16 in on 11x17. */
export const HIGHLIGHT_WIDTH = 0.004;

/** A finished stroke keeps at most this many points. */
export const MAX_STROKE_POINTS = 500;

/** How many steps Undo goes back. */
export const UNDO_DEPTH = 100;

/** Distance from p to the segment a-b. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Ramer-Douglas-Peucker: keeps the first and last points and every point farther than `tolerance` from the line
 * through the points kept around it. Iterative, so a long stroke can't overflow the stack.
 */
export function simplify(points: readonly Point[], tolerance: number): Point[] {
  const last = points.length - 1;
  if (last < 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[last] = 1;
  const spans: [number, number][] = [[0, last]];
  for (let span = spans.pop(); span !== undefined; span = spans.pop()) {
    const [from, to] = span;
    const a = points[from];
    const b = points[to];
    if (a === undefined || b === undefined) continue;
    let far = -1;
    let farDist = tolerance;
    for (let i = from + 1; i < to; i += 1) {
      const p = points[i];
      if (p === undefined) continue;
      const d = segmentDistance(p, a, b);
      if (d > farDist) {
        far = i;
        farDist = d;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      spans.push([from, far], [far, to]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * A drawn stroke as it is saved: points on the page (0..1), rounded, repeats dropped, a tap kept as a dot, and simplified
 * to well under MAX_STROKE_POINTS without a visible change (a quarter of the line width). `aspect` is the page's
 * height / width, so x and y are compared in the same units. Null when nothing was drawn.
 */
export function finishStroke(raw: readonly Point[], c: MarkupColor, w: number, aspect: number): Stroke | null {
  const pts: Point[] = [];
  for (const [x, y] of raw) {
    const p: Point = [round(clamp01(x)), round(clamp01(y))];
    const prev = pts[pts.length - 1];
    if (prev === undefined || prev[0] !== p[0] || prev[1] !== p[1]) pts.push(p);
  }
  const first = pts[0];
  if (first === undefined) return null;
  if (pts.length === 1) pts.push([first[0], first[1]]);
  const square = pts.map(([x, y]): Point => [x, y * aspect]);
  let tolerance = w * 0.25;
  let kept = simplify(square, tolerance);
  while (kept.length > MAX_STROKE_POINTS) {
    tolerance *= 2;
    kept = simplify(square, tolerance);
  }
  return clampStroke({ c, w, p: kept.map(([x, y]): Point => [x, round(y / aspect)]) });
}

/** SVG path data for a stroke on a viewBox of 0 0 1 aspect. */
export function strokePath(points: readonly Point[], aspect: number): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${String(x)} ${String(round(y * aspect))}`).join(' ');
}

/** Undo history: the strokes as they were before each change, newest last, at most UNDO_DEPTH steps. */
export function rememberBefore(past: readonly Stroke[][], before: Stroke[]): Stroke[][] {
  const next = [...past, before];
  return next.length > UNDO_DEPTH ? next.slice(next.length - UNDO_DEPTH) : next;
}

/** One step back: the strokes to show and the shorter history. Null when there is nothing to undo. */
export function undoStep(past: readonly Stroke[][]): { strokes: Stroke[]; past: Stroke[][] } | null {
  const strokes = past[past.length - 1];
  return strokes === undefined ? null : { strokes, past: past.slice(0, -1) };
}
