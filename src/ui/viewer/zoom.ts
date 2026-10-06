// The viewer's zoom: 1 is the fit (the whole picture, or a PDF page as wide as the window). + and - step by a quarter,
// from half the fit to 6x. A dragged picture never leaves the window.

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 6;
/** A tap on a fitted picture zooms in this far; a tap on a zoomed one goes back to the fit. */
export const TAP_ZOOM = 2.5;
const STEP = 1.25;

/** A pinch's or the wheel's zoom, kept between the limits. */
export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1000) / 1000));
}

export function zoomStep(z: number, dir: 1 | -1): number {
  const next = dir > 0 ? z * STEP : z / STEP;
  // Passing the fit on the way stops there, so Fit is always one of the steps.
  if ((z < 1 && next > 1) || (z > 1 && next < 1)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 1000) / 1000));
}

/** How far a picture of this box size, zoomed z, may be dragged from the middle (each way). */
export function clampPan(pan: { x: number; y: number }, box: { w: number; h: number }, z: number): { x: number; y: number } {
  const within = (v: number, max: number) => (max <= 0 ? 0 : Math.min(max, Math.max(-max, v)));
  return { x: within(pan.x, ((z - 1) * box.w) / 2), y: within(pan.y, ((z - 1) * box.h) / 2) };
}
