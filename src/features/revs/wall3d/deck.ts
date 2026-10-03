// The deck over the wall: a corrugated steel sheet under a concrete topping. Its low flats bear on the wall every 12
// (one centered on the beam); the flutes between them are the voids over the top track that the TOW speed plugs fill.
// Profiles in the (x, z) plane, extruded through the wall by the assembly. Pure.
import type { Pt } from './iso';
import { BEAM, H, L } from './dims';

const PERIOD = 12;
const LOW_AT = BEAM.x0 + (BEAM.x1 - BEAM.x0) / 2;
const FLUTE = 3;
const SHEET = 0.6;
const TOPPING = 3.4;
export const DECK_X: [number, number] = [-4, L + 4];
export const DECK_TOP = H + FLUTE + SHEET + TOPPING;

/** The sheet's underside at x: low flats at H, high flats at H + FLUTE, 2 of slope between. */
export function undersideAt(x: number): number {
  const u = (((x - LOW_AT + 2) % PERIOD) + PERIOD) % PERIOD; // 0..4 low, 4..6 up, 6..10 high, 10..12 down
  if (u <= 4) return H;
  if (u <= 6) return H + ((u - 4) / 2) * FLUTE;
  if (u <= 10) return H + FLUTE;
  return H + FLUTE - ((u - 10) / 2) * FLUTE;
}

/** The underside's corners from left to right. */
function underside(): Pt[] {
  const [x0, x1] = DECK_X;
  const xs = new Set<number>([x0, x1]);
  for (let c = LOW_AT - PERIOD * 12; c < x1 + PERIOD; c += PERIOD) {
    for (const d of [-2, 2, 4, 8]) if (c + d > x0 && c + d < x1) xs.add(c + d);
  }
  return [...xs].sort((a, b) => a - b).map((x) => [x, undersideAt(x)] as Pt);
}

const lift = (pts: readonly Pt[], dz: number): Pt[] => pts.map(([x, z]) => [x, z + dz] as Pt);

export function sheetProfile(): Pt[] {
  const under = underside();
  return [...under, ...lift(under, SHEET).reverse()];
}

export function toppingProfile(): Pt[] {
  return [...lift(underside(), SHEET), [DECK_X[1], DECK_TOP], [DECK_X[0], DECK_TOP]];
}

/** The flute voids over the track (none at the beam): each a trapezoid profile, seen end-on at the deck's cut edge. */
export function flutePlugs(): Pt[][] {
  const voids: [number, number][] = [];
  for (let c = LOW_AT - PERIOD * 12; c < L; c += PERIOD) voids.push([c + 2, c + 10]);
  return voids
    .filter(([a, b]) => a >= 0 && b <= L && (b <= BEAM.x0 - 2 || a >= BEAM.x1 + 2))
    .map(([a, b]) => [
      [a, H],
      [b, H],
      [b - 2, H + FLUTE],
      [a + 2, H + FLUTE],
    ]);
}

/** The steel beam's I section (flanges 1 thick, web 1 thick), its top flange under the deck. */
export function beamProfile(): Pt[] {
  const { x0, x1 } = BEAM;
  const mid = (x0 + x1) / 2;
  const top = H;
  const bot = H - BEAM.depth;
  return [
    [x0, bot],
    [x1, bot],
    [x1, bot + 1],
    [mid + 0.5, bot + 1],
    [mid + 0.5, top - 1],
    [x1, top - 1],
    [x1, top],
    [x0, top],
    [x0, top - 1],
    [mid - 0.5, top - 1],
    [mid - 0.5, bot + 1],
    [x0, bot + 1],
  ];
}
