// The walls on the plan worked out (0059; Jesse, Oct 3: "this wall here, on grid line 7 of the electrical room ... build
// it out that way, piecemeal, around the whole building"). A wall's line is points [x, y] as fractions of its sheet
// page (origin top-left). Measured in page widths (y times the page's aspect, height / width) so x and y compare. Here:
// each wall's color on the plan, where its label sits, which wall a tap is on, where a tapped point lands (onto a
// corner already drawn, or square to the last point), the part of the sheet a thumbnail shows, and a level's sheets.
// Pure; tested in planGeom.test.ts.
import type { RevArea, WallLine } from '../../../data/revs.types';
import type { StatusKey } from '../../../lib/status';
import type { WallCount } from '../wallPage';

export type Pt = [number, number];

/** A wall's color on the plan (lib/status): any failed red, any requested gold, all passed green; null = neutral. */
export function wallTone(c: WallCount): StatusKey | null {
  if (c.failed > 0) return 'not_approved';
  if (c.requested > 0) return 'pending';
  if (c.needed > 0 && c.passed === c.needed) return 'approved';
  return null;
}

/** The tone as a color, the one each status bar uses (WallProgress); neutral is a grey that reads on a drawing. */
export function toneColor(tone: StatusKey | null): string {
  if (tone === null) return 'var(--status-step_ahead-fg)';
  if (tone === 'pending') return 'var(--status-pending-dot)';
  return `var(--status-${tone}-solid)`;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Points in page widths (y scaled by the aspect), so lengths and angles are true. */
function units(line: readonly Pt[], aspect: number): Pt[] {
  return line.map(([x, y]) => [x, y * aspect]);
}

/** The point halfway along the line and the direction of the segment it is on (a unit vector, page-width units). */
export function midpoint(line: readonly Pt[], aspect: number): { at: Pt; dir: Pt } {
  const u = units(line, aspect);
  const total = u.slice(1).reduce((s, p, i) => s + dist(u[i] ?? p, p), 0);
  let left = total / 2;
  for (let i = 1; i < u.length; i += 1) {
    const a = u[i - 1];
    const b = u[i];
    if (!a || !b) continue;
    const len = dist(a, b);
    if (len > 0 && (left <= len || i === u.length - 1)) {
      const t = Math.min(1, left / len);
      return { at: [a[0] + (b[0] - a[0]) * t, (a[1] + (b[1] - a[1]) * t) / aspect], dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
    }
    left -= len;
  }
  const first = line[0] ?? [0, 0];
  return { at: first, dir: [1, 0] };
}

/** Distance from p to a polyline (any one unit, e.g. screen pixels). */
export function distanceTo(p: Pt, line: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1];
    const b = line[i];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return line.length === 1 && line[0] ? dist(p, line[0]) : best;
}

/** The wall nearest a tap, within `reach` (same units as the lines), or null. */
export function wallAt<T extends { line: readonly Pt[] }>(p: Pt, walls: readonly T[], reach: number): T | null {
  let best: T | null = null;
  let bestD = reach;
  for (const w of walls) {
    const d = distanceTo(p, w.line);
    if (d <= bestD) {
      best = w;
      bestD = d;
    }
  }
  return best;
}

/** Within this many degrees of level or plumb, a new segment is squared up. */
const SQUARE_DEG = 5;

/**
 * Where a tapped point lands: onto a corner already drawn (another wall's end or corner, or this line's own start) when
 * within `snap` page widths, else squared up with the line's last point when nearly level or plumb. Kept on the page.
 */
export function placePoint(p: Pt, line: readonly Pt[], corners: readonly Pt[], snap: number, aspect: number): Pt {
  let near: Pt | null = null;
  let nearD = snap;
  for (const c of [...corners, ...(line.length > 1 && line[0] ? [line[0]] : [])]) {
    const d = Math.hypot(c[0] - p[0], (c[1] - p[1]) * aspect);
    if (d <= nearD) {
      near = c;
      nearD = d;
    }
  }
  if (near) return [near[0], near[1]];
  const last = line[line.length - 1];
  const out: Pt = [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))];
  if (!last) return out;
  const dx = out[0] - last[0];
  const dy = (out[1] - last[1]) * aspect;
  const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  if (deg <= SQUARE_DEG) return [out[0], last[1]];
  if (deg >= 90 - SQUARE_DEG) return [last[0], out[1]];
  return out;
}

/** A line worth saving: at least two points apart. */
export function isLine(line: readonly Pt[]): boolean {
  return line.length >= 2 && line.some((p) => p[0] !== line[0]?.[0] || p[1] !== line[0][1]);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** How much of the screen a view on it fills (the sheet viewer's focus; half when not given). */
  fill?: number | undefined;
}

/** The lines' bounding box (fractions). */
export function boxOf(lines: readonly (readonly Pt[])[]): Box {
  const pts = lines.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The part of the page a thumbnail shows around a line: its box padded (a third of its size, at least `minPad` page
 * widths, so the grid and rooms around it show), widened to the thumbnail's shape (`shape` = its height / width), and
 * kept on the page where it fits.
 */
export function cropAround(line: readonly Pt[], aspect: number, shape: number, minPad = 0.06): Box {
  const b = boxOf([line]);
  // In page widths.
  const pad = Math.max(minPad, b.w / 3, (b.h * aspect) / 3);
  let w = b.w + 2 * pad;
  let h = b.h * aspect + 2 * pad;
  if (h / w > shape) w = h / shape;
  else h = w * shape;
  const cx = b.x + b.w / 2;
  const cy = (b.y + b.h / 2) * aspect;
  const fit = (c: number, size: number, max: number) => (size >= max ? (max - size) / 2 : Math.min(max - size, Math.max(0, c - size / 2)));
  const x = fit(cx, w, 1);
  const y = fit(cy, h, aspect);
  return { x, y: y / aspect, w, h: h / aspect };
}

export interface PlanTarget {
  fileId: string;
  page: number;
}

export const targetKey = (t: PlanTarget) => `${t.fileId}#${String(t.page)}`;

/** A level's sheets (and pages): those its walls are drawn on, most walls first; none drawn yet: those its walls name. */
export function levelTargets(areas: readonly Pick<RevArea, 'sheet_file_id' | 'sheet_page' | 'geom'>[]): PlanTarget[] {
  const drawn = new Map<string, { t: PlanTarget; n: number; at: number }>();
  const named: PlanTarget[] = [];
  areas.forEach((a, i) => {
    if (a.sheet_file_id === null) return;
    const t = { fileId: a.sheet_file_id, page: a.sheet_page };
    if (a.geom === null) {
      named.push(t);
      return;
    }
    const k = targetKey(t);
    const was = drawn.get(k);
    drawn.set(k, { t, n: (was?.n ?? 0) + 1, at: was?.at ?? i });
  });
  const out = [...drawn.values()].sort((a, b) => b.n - a.n || a.at - b.at).map((d) => d.t);
  if (out.length > 0) return out;
  for (const t of named) if (!out.some((o) => targetKey(o) === targetKey(t))) out.push(t);
  return out;
}

/** Every corner of these walls' lines (where a new wall's end may land). */
export function cornersOf(lines: readonly WallLine[]): Pt[] {
  return lines.flat().map(([x, y]): Pt => [x, y]);
}
