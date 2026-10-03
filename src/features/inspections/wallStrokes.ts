// An OFS request's map drawn from its walls (0059): when the request's walls are drawn on the plan (Revs) on the map's
// sheet and page, and nothing is marked yet, each wall gets one highlighter stroke per item along its line, in that
// item's color. Two or three colors on one wall sit side by side (each moved sideways by a stroke's width), so every
// color shows, as OSFM reads the map. The strokes are what ir_map_save accepts (lib/markup STROKE_LIMITS): points kept
// on the page, at least two, rounded; 300 strokes at most. The person can still change them. Pure; tested in
// wallStrokes.test.ts.
import type { RevArea, WallLine } from '../../data/revs.types';
import { HIGHLIGHT_WIDTH, STROKE_LIMITS, type MarkupColor, type Stroke } from '../../lib/markup';

type Pt = [number, number];

/** A request's wall as its map draws it: where it is on the plan and the colors of the items asked for on it. */
export interface MapWall {
  sheetFileId: string;
  page: number;
  line: WallLine;
  colors: MarkupColor[];
}

/** The request's walls drawn on the plan, each with its items' colors (in color order). Walls not on the plan are left out. */
export function mapWalls(
  cells: readonly { area_id: string; color: number }[],
  areas: readonly Pick<RevArea, 'id' | 'sheet_file_id' | 'sheet_page' | 'geom'>[],
): MapWall[] {
  const out: MapWall[] = [];
  for (const a of areas) {
    if (a.geom === null || a.sheet_file_id === null) continue;
    const colors = [...new Set(cells.filter((c) => c.area_id === a.id).map((c) => c.color))]
      .filter((c): c is MarkupColor => c === 1 || c === 2 || c === 3)
      .sort((x, y) => x - y);
    if (colors.length > 0) out.push({ sheetFileId: a.sheet_file_id, page: a.sheet_page, line: a.geom, colors });
  }
  return out;
}

/** A corner pushed out at most this many times the offset (a sharp corner would otherwise shoot far off). */
const MITER_LIMIT = 3;

const round = (n: number) => Math.round(n * 1e5) / 1e5;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The unit normal of a to b (to its right on the page as seen, y down), in page-width units; null when a = b. */
function normal(a: Pt, b: Pt): Pt | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  return len === 0 ? null : [-dy / len, dx / len];
}

/**
 * The line moved sideways by `d` page widths (positive: to the right of the way it was drawn, on the page as seen),
 * corners mitered (at most MITER_LIMIT times `d` out), kept on the page. `aspect` is the page's height / width, so the
 * move is the same on screen whichever way the wall runs.
 */
export function offsetLine(line: readonly Pt[], d: number, aspect: number): Pt[] {
  const u = line
    .map(([x, y]): Pt => [x, y * aspect])
    .filter((p, i, all) => i === 0 || p[0] !== all[i - 1]?.[0] || p[1] !== all[i - 1]?.[1]);
  if (u.length < 2 || d === 0) return line.map(([x, y]): Pt => [clamp01(x), clamp01(y)]);
  const out: Pt[] = u.map((p, i) => {
    const before = i > 0 ? normal(u[i - 1] ?? p, p) : null;
    const after = i < u.length - 1 ? normal(p, u[i + 1] ?? p) : null;
    const a = before ?? after ?? [0, 0];
    const b = after ?? before ?? [0, 0];
    const mx = a[0] + b[0];
    const my = a[1] + b[1];
    const len = Math.hypot(mx, my);
    // A straight run, or the line turning back on itself: plain sideways.
    if (len < 1e-9) return [p[0] + a[0] * d, p[1] + a[1] * d];
    const cos = (mx / len) * a[0] + (my / len) * a[1];
    const k = Math.min(MITER_LIMIT, 1 / Math.max(cos, 1e-9));
    return [p[0] + (mx / len) * d * k, p[1] + (my / len) * d * k];
  });
  return out.map(([x, y]): Pt => [clamp01(x), clamp01(y / aspect)]);
}

/** A stroke's points as saved: rounded, repeats dropped, two at least. */
function savedPoints(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const [x, y] of points) {
    const p: Pt = [round(x), round(y)];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  const first = out[0];
  if (first && out.length === 1) out.push([first[0], first[1]]);
  return out.slice(0, STROKE_LIMITS.maxPoints);
}

/**
 * The map's strokes for the walls on this sheet and page: one per wall per color, the colors side by side around the
 * wall's line. Empty when none of the walls is there.
 */
export function wallStrokes(walls: readonly MapWall[], sheetFileId: string, page: number, aspect: number, width = HIGHLIGHT_WIDTH): Stroke[] {
  const out: Stroke[] = [];
  for (const w of walls) {
    if (w.sheetFileId !== sheetFileId || w.page !== page) continue;
    w.colors.forEach((c, i) => {
      const d = (i - (w.colors.length - 1) / 2) * width;
      const p = savedPoints(offsetLine(w.line, d, aspect));
      if (p.length >= STROKE_LIMITS.minPoints) out.push({ c, w: width, p });
    });
  }
  return out.slice(0, STROKE_LIMITS.maxStrokes);
}

/** The page of this sheet the request's walls are drawn on (the first of them), or 1. */
export function wallPage(walls: readonly MapWall[], sheetFileId: string): number {
  return walls.find((w) => w.sheetFileId === sheetFileId)?.page ?? 1;
}
