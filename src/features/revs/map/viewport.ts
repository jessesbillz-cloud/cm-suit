// Pan and zoom of a sheet in its frame. Pure math, unit-tested in viewport.test.ts.
//
// The sheet is laid out at its fit size (the whole page in the frame) and moved with one transform: translate(x, y)
// scale(z). z = 1 is the whole page; x, y are where its top-left corner sits in the frame, in CSS pixels.

export interface View {
  x: number;
  y: number;
  z: number;
}

export interface Size {
  w: number;
  h: number;
}

/** How far in: 12x the whole page shows a few feet of a 1/8" plan across a phone. */
export const MAX_ZOOM = 12;

/** The page fitted inside the frame (aspect = page height / width). */
export function fitSize(aspect: number, frame: Size): Size {
  if (frame.w <= 0 || frame.h <= 0 || aspect <= 0) return { w: 0, h: 0 };
  const w = Math.min(frame.w, frame.h / aspect);
  return { w, h: w * aspect };
}

/** The whole page, centered. */
export function fitView(fit: Size, frame: Size): View {
  return { x: (frame.w - fit.w) / 2, y: (frame.h - fit.h) / 2, z: 1 };
}

function clampAxis(pos: number, size: number, frame: number): number {
  if (size <= frame) return (frame - size) / 2;
  return Math.min(0, Math.max(frame - size, pos));
}

/** Zoom between the whole page and MAX_ZOOM; a page smaller than the frame is centered, a bigger one covers it. */
export function clampView(v: View, fit: Size, frame: Size): View {
  const z = Math.min(MAX_ZOOM, Math.max(1, v.z));
  return { x: clampAxis(v.x, fit.w * z, frame.w), y: clampAxis(v.y, fit.h * z, frame.h), z };
}

/** Zooms by `factor`, keeping the point (fx, fy) of the frame where it is. */
export function zoomAt(v: View, fx: number, fy: number, factor: number, fit: Size, frame: Size): View {
  const z = Math.min(MAX_ZOOM, Math.max(1, v.z * factor));
  const k = z / v.z;
  return clampView({ x: fx - (fx - v.x) * k, y: fy - (fy - v.y) * k, z }, fit, frame);
}

export interface Pt {
  x: number;
  y: number;
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Two fingers: the sheet point under the fingers' midpoint at the start stays under their midpoint now, and the zoom
 * follows the distance between them. Moving both fingers together pans.
 */
export function pinchView(start: View, a0: Pt, b0: Pt, a1: Pt, b1: Pt, fit: Size, frame: Size): View {
  const d0 = dist(a0, b0);
  const z = Math.min(MAX_ZOOM, Math.max(1, d0 > 0 ? (start.z * dist(a1, b1)) / d0 : start.z));
  const m0 = mid(a0, b0);
  const m1 = mid(a1, b1);
  const cx = (m0.x - start.x) / start.z;
  const cy = (m0.y - start.y) / start.z;
  return clampView({ x: m1.x - cx * z, y: m1.y - cy * z, z }, fit, frame);
}

/** A point of the frame as fractions of the page (0..1 inside it, origin top-left). */
export function toPage(v: View, fit: Size, fx: number, fy: number): [number, number] {
  return [(fx - v.x) / (fit.w * v.z), (fy - v.y) / (fit.h * v.z)];
}

/** The part of the page in view, in fit-size pixels (the page's own layout box), or null when none of it is. */
export function visibleRegion(v: View, fit: Size, frame: Size): { x: number; y: number; w: number; h: number } | null {
  const left = Math.max(0, -v.x / v.z);
  const top = Math.max(0, -v.y / v.z);
  const right = Math.min(fit.w, (frame.w - v.x) / v.z);
  const bottom = Math.min(fit.h, (frame.h - v.y) / v.z);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Pixels per fit-size pixel for a canvas of `area` fit-pixels that should be `want` times sharper, kept under
 * `maxPixels` so a phone never runs out of canvas memory.
 */
export function cappedDensity(area: number, want: number, maxPixels: number): number {
  if (area <= 0) return want;
  return Math.min(want, Math.sqrt(maxPixels / area));
}
