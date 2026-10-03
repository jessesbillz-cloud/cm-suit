// A signature as drawn on the pad (migration 0060): strokes of [x, y] points, fractions 0..1 of a pad twice as wide as
// tall, origin top-left, rounded to 3 places, with the database's limits (safety_signature_ok). Pure.
import type { Signature } from '../../data/safety.types';

/** The pad is twice as wide as tall, on the phone, in the app and on the PDF. */
export const PAD_ASPECT = 2;

const SIGNATURE_LIMITS = { strokes: 80, perStroke: 1500, points: 3000 } as const;

/** Points closer than this to the last one add nothing (a fraction of the pad's width). */
const MIN_STEP = 0.004;

function round3(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
}

/** A point on the pad from a pointer position inside a box. */
export function padPoint(x: number, y: number, width: number, height: number): [number, number] {
  return [round3(width > 0 ? x / width : 0), round3(height > 0 ? y / height : 0)];
}

export function pointCount(strokes: Signature): number {
  return strokes.reduce((n, s) => n + s.length, 0);
}

/** May the next point go on? (The limits of a stroke and of the whole signature.) */
export function hasRoom(strokes: Signature, inStroke: number): boolean {
  return pointCount(strokes) < SIGNATURE_LIMITS.points && inStroke < SIGNATURE_LIMITS.perStroke;
}

/** May a new stroke start? */
export function canStartStroke(strokes: Signature): boolean {
  return strokes.length < SIGNATURE_LIMITS.strokes && pointCount(strokes) < SIGNATURE_LIMITS.points;
}

/** Is this point far enough from the stroke's last one to keep? */
export function farEnough(last: readonly [number, number] | undefined, p: readonly [number, number]): boolean {
  if (!last) return true;
  // y is a fraction of the height, which is half the width: measure both in widths.
  return Math.hypot(p[0] - last[0], (p[1] - last[1]) / PAD_ASPECT) >= MIN_STEP;
}

/** Enough ink to count as a signature: two points, and more than a dot across. */
export function isSignature(strokes: Signature): boolean {
  if (pointCount(strokes) < 2) return false;
  const xs = strokes.flatMap((s) => s.map((p) => p[0]));
  const ys = strokes.flatMap((s) => s.map((p) => p[1]));
  return Math.max(...xs) - Math.min(...xs) > 0.02 || Math.max(...ys) - Math.min(...ys) > 0.04;
}

/** An SVG path for one stroke drawn in a w x h box (a dot becomes a tiny line so it shows). */
export function strokePath(stroke: readonly (readonly [number, number])[], w: number, h: number): string {
  const first = stroke[0];
  if (!first) return '';
  const at = (p: readonly [number, number]) => `${String(round1(p[0] * w))} ${String(round1(p[1] * h))}`;
  if (stroke.length === 1) return `M ${at(first)} l 0.1 0.1`;
  return stroke.map((p, i) => `${i === 0 ? 'M' : 'L'} ${at(p)}`).join(' ');
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
