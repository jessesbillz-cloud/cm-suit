// How each piece of the 3-D wall is painted: a light grey line drawing by material, or tinted by its state with the
// lib/status colors (passed green, requested gold, failed red; N/A faded). Faces are shaded darker by how they face
// the light. Pure.
import { STATUS } from '../../../lib/status';
import type { Material } from './assembly';

export type PartState = 'passed' | 'requested' | 'failed' | 'open' | 'na';

export interface Paint {
  fill: string;
  stroke: string;
  /** N/A: drawn faint. */
  faint: boolean;
}

const hex = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** a blended toward b by t (0..1), as #RRGGBB. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const c = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`.toUpperCase();
}

const INK = '#0F1A2B';

/** A face's fill, darker by `amount` (from iso shadeOf). */
export function shade(fill: string, amount: number): string {
  return mix(fill, INK, amount);
}

// The line drawing: near-white fills by material, grey lines.
const LINE = '#8B95A5';
const CONTEXT_LINE = '#AEB5C0';
const MATERIAL_FILL: Record<Material, string> = {
  board: '#FFFFFF',
  steel: '#E9EDF2',
  wool: '#F7F6F3',
  concrete: '#EEF0F3',
  foam: '#F4F5F7',
  sealant: '#F1F2F5',
  pipe: '#E4E8EE',
  tape: '#F6F7F9',
};

const TINTS: Record<'passed' | 'requested' | 'failed', (typeof STATUS)[keyof typeof STATUS]> = {
  passed: STATUS.approved,
  requested: STATUS.pending,
  failed: STATUS.not_approved,
};

/** The deck's steel sheet and the beam: a shade darker than the studs, so the sheet's wave and the beam's I read. */
const CONTEXT_STEEL = '#D9DFE7';

/** A piece's paint: context (slab, deck, beam) stays a lighter line drawing; a part shows its state. */
export function paintOf(material: Material, state: PartState | undefined, context = false): Paint {
  if (context) return { fill: material === 'steel' ? CONTEXT_STEEL : MATERIAL_FILL[material], stroke: CONTEXT_LINE, faint: false };
  if (state === 'passed' || state === 'requested' || state === 'failed') {
    const s = TINTS[state];
    return { fill: mix(s.bg, s.dot, 0.3), stroke: mix(s.solid, s.fg, 0.35), faint: false };
  }
  if (state === 'na') return { fill: STATUS.cancelled.bg, stroke: STATUS.cancelled.dot, faint: true };
  return { fill: MATERIAL_FILL[material], stroke: LINE, faint: false };
}
