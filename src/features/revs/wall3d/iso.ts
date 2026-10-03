// The 3-D wall's projection: one fixed axonometric view (from the front, a little to the left, from above), so every
// shape is drawn at the same angles. x runs along the wall, y through it (front to back), z up. Shapes are 2-D profiles
// extruded along an axis; only the faces that look at the viewer are kept, farthest first (the painter's order), each
// with its outward normal so it can be shaded. Pure: no React, no DOM.

export type Vec3 = readonly [number, number, number];
export type Pt = readonly [number, number];
type Axis = 'x' | 'y' | 'z';

/** Where one unit along x, y and z lands on the screen (SVG: y grows down). The wall rises gently to the right. */
const AXES: Record<Axis, Pt> = { x: [0.92, -0.2], y: [-0.42, -0.3], z: [0, -0.95] };

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The direction the viewer looks in (into the scene): the one 3-D direction the projection flattens to a point. */
function viewDirection(): Vec3 {
  const r1: Vec3 = [AXES.x[0], AXES.y[0], AXES.z[0]];
  const r2: Vec3 = [AXES.x[1], AXES.y[1], AXES.z[1]];
  const v: Vec3 = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
  const len = Math.hypot(...v);
  // Looking down: the view goes toward -z.
  const sign = v[2] > 0 ? -1 : 1;
  return [(sign * v[0]) / len, (sign * v[1]) / len, (sign * v[2]) / len];
}

export const VIEW: Vec3 = viewDirection();

/** Light from the front, the left and above: tops lightest, fronts in between, left ends darkest. */
const LIGHT: Vec3 = [-0.3, -0.55, 0.78];

export function project(p: Vec3): Pt {
  return [p[0] * AXES.x[0] + p[1] * AXES.y[0] + p[2] * AXES.z[0], p[0] * AXES.x[1] + p[1] * AXES.y[1] + p[2] * AXES.z[1]];
}

/** How far into the scene a point is (larger is farther). */
export function depthOf(p: Vec3): number {
  return dot(p, VIEW);
}

/** A face whose outward normal points at the viewer is seen. */
export function facesViewer(normal: Vec3): boolean {
  return dot(normal, VIEW) < -1e-9;
}

/** How much darker a face is drawn, 0 (lit head-on) to 0.16, from its normal. */
export function shadeOf(normal: Vec3): number {
  const len = Math.hypot(...normal) * Math.hypot(...LIGHT);
  const lit = Math.max(0, dot(normal, LIGHT) / len);
  return Math.round(0.16 * (1 - lit) * 1000) / 1000;
}

export interface Face {
  /** The projected outline. */
  pts: Pt[];
  normal: Vec3;
  depth: number;
  /** The end cap (the profile itself) or a side; a smooth shape's sides are filled but not outlined. */
  kind: 'cap' | 'side';
}

/** A profile point (u, w) at position t along the axis, as a 3-D point. */
function place(axis: Axis, u: number, w: number, t: number): Vec3 {
  if (axis === 'x') return [t, u, w];
  if (axis === 'y') return [u, t, w];
  return [u, w, t];
}

const unit: Record<Axis, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** Twice the signed area of a profile: positive when it winds counterclockwise. */
export function signedArea(profile: readonly Pt[]): number {
  let a = 0;
  profile.forEach((p, i) => {
    const q = profile[(i + 1) % profile.length] ?? p;
    a += p[0] * q[1] - q[0] * p[1];
  });
  return a;
}

const centroid3 = (pts: readonly Vec3[]): Vec3 => {
  const n = pts.length || 1;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n, pts.reduce((s, p) => s + p[2], 0) / n];
};

/**
 * Which faces to keep: all that are seen, only the near cap (a piece seen only end-on, flush with what is around it),
 * none facing down (the underside of the deck, seen only past its cut edge), or none facing up (a piece under another).
 */
export type Keep = 'all' | 'cap' | 'no-under' | 'no-top';

/**
 * A profile in the plane across `axis` (for y: (x, z); for z: (x, y); for x: (y, z)) extruded from `from` to `to`:
 * the faces the viewer sees, in the order to paint them.
 */
export function extrude(profile: readonly Pt[], axis: Axis, from: number, to: number, keep: Keep = 'all'): Face[] {
  const ccw = signedArea(profile) > 0;
  const faces: Face[] = [];
  const [a, b, c] = unit[axis];
  const caps: [number, Vec3][] = [
    [from, [-a, -b, -c]],
    [to, unit[axis]],
  ];
  for (const [t, normal] of caps) {
    if (!facesViewer(normal)) continue;
    const pts3 = profile.map(([u, w]) => place(axis, u, w, t));
    faces.push({ pts: pts3.map(project), normal, depth: depthOf(centroid3(pts3)), kind: 'cap' });
  }
  if (keep !== 'cap') {
    profile.forEach((p, i) => {
      const q = profile[(i + 1) % profile.length] ?? p;
      const du = q[0] - p[0];
      const dw = q[1] - p[1];
      // The edge's outward normal in the profile's plane, then in 3-D.
      const n2: Pt = ccw ? [dw, -du] : [-dw, du];
      const normal = place(axis, n2[0], n2[1], 0);
      if (!facesViewer(normal)) return;
      if ((keep === 'no-under' && normal[2] < 0) || (keep === 'no-top' && normal[2] > 0)) return;
      const pts3 = [place(axis, p[0], p[1], from), place(axis, q[0], q[1], from), place(axis, q[0], q[1], to), place(axis, p[0], p[1], to)];
      faces.push({ pts: pts3.map(project), normal, depth: depthOf(centroid3(pts3)), kind: 'side' });
    });
  }
  // Sides farthest first; the cap last, since it is in front of every side seen past it.
  return faces.sort((a, b) => (a.kind === b.kind ? b.depth - a.depth : a.kind === 'cap' ? 1 : -1));
}

/** A rectangle profile. */
export function rect(u0: number, w0: number, u1: number, w1: number): Pt[] {
  return [
    [u0, w0],
    [u1, w0],
    [u1, w1],
    [u0, w1],
  ];
}

/** A circle profile of n sides, counterclockwise. */
export function circle(cu: number, cw: number, r: number, n = 14): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cu + r * Math.cos(a), cw + r * Math.sin(a)] as Pt;
  });
}

/** The convex hull of points (Andrew's monotone chain), for a smooth shape's outline. */
export function convexHull(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2] ?? p, out[out.length - 1] ?? p, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** An SVG path for a closed outline, to 0.01. */
export function pathOf(pts: readonly Pt[]): string {
  const r = (n: number) => String(Math.round(n * 100) / 100);
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p[0])} ${r(p[1])}`).join('') + 'Z';
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(pts: readonly Pt[]): Box {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
