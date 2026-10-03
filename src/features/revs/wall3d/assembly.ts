// A rated stud wall assembly, drawn once: slab, fluted metal deck with a beam, top and bottom track, studs, cavity
// insulation, two layers of board each side, fire tape, a control joint, an electrical box, pipes and a conduit.
// The layers step back from left to right so each one shows (back boards at the left, front boards at the right) and
// are pulled apart a little through the wall. Each piece is keyed by its WallPart; slab, deck and beam are context.
// Units are nominal (about an inch), not to scale. The deck, its flutes and the beam are in deck.ts.
import type { WallPart } from '../wallParts';
import { beamProfile, DECK_TOP, DECK_X, flutePlugs, sheetProfile, toppingProfile } from './deck';
import { boundsOf, circle, convexHull, extrude, project, rect, type Box, type Face, type Keep, type Pt, type Vec3 } from './iso';
import { BACK, BEAM, CJ, D, FRONT, G, H, HOW_GAP, L, S1L1, S1L2, S2L1, S2L2 } from './dims';

type DrawnPart = Exclude<WallPart, 'whole_wall'>;
type Context = 'slab' | 'deck' | 'topping' | 'beam';
export type Material = 'steel' | 'board' | 'wool' | 'concrete' | 'foam' | 'sealant' | 'pipe' | 'tape';

export interface Piece {
  faces: Face[];
  /** A round shape: its sides are shaded without lines and it gets this one outline. */
  outline?: Pt[] | undefined;
}

export interface Layer {
  id: DrawnPart | Context;
  material: Material;
  pieces: Piece[];
  /** Behind everything from this side (the second side's fire tape): drawn as a dashed hidden line. */
  hidden?: boolean | undefined;
}

/** Where a part's label goes: above the wall, or below it. */
export type Slot = 'top' | 'bottom';

interface Assembly {
  /** Back to front. */
  layers: Layer[];
  /** Where each part's callout leader starts (a point on the part that shows). */
  anchors: Record<WallPart, Pt>;
  slots: Record<WallPart, Slot>;
  /** The drawing's top edge (the deck's back top) and bottom edge (the slab's front bottom), each left to right. */
  edges: { top: [Pt, Pt]; bottom: [Pt, Pt] };
  view: Box;
}

const box = (x0: number, x1: number, y: readonly [number, number], z0: number, z1: number, keep: Keep = 'all'): Piece => ({
  faces: extrude(rect(x0, z0, x1, z1), 'y', y[0], y[1], keep),
});

/**
 * A run along the wall that steps down under the beam: one, two or three boxes. Under it, a piece reaching into the
 * beam's depth loses that much off its top; one wholly within it (a head-of-wall strip) drops by the beam's depth.
 */
function run(x0: number, x1: number, y: readonly [number, number], z0: number, z1: number): Piece[] {
  const cuts = [x0, ...[BEAM.x0, BEAM.x1].filter((c) => c > x0 && c < x1), x1];
  return cuts.slice(1).map((end, i) => {
    const start = cuts[i] ?? x0;
    const under = start >= BEAM.x0 && end <= BEAM.x1 && z1 > H - BEAM.depth;
    if (!under) return box(start, end, y, z0, z1);
    const whole = z0 >= H - BEAM.depth;
    return box(start, end, y, whole ? z0 - BEAM.depth : z0, z1 - BEAM.depth);
  });
}

/** A board layer from x0 to the end, split at the control joint when asked. */
function board(x0: number, y: readonly [number, number], splitAtCj: boolean): Piece[] {
  const z0 = 0.3;
  const z1 = H - HOW_GAP;
  if (!splitAtCj) return run(x0, L, y, z0, z1);
  return [...run(x0, CJ.x0, y, z0, z1), ...run(CJ.x1, L, y, z0, z1)];
}

/** A round piece (pipe, conduit, collar) along z (upright) or y (through the wall). */
function round(axis: 'y' | 'z', cu: number, cw: number, r: number, from: number, to: number): Piece {
  const faces = extrude(circle(cu, cw, r), axis, from, to);
  return { faces, outline: convexHull(faces.flatMap((f) => f.pts)) };
}

const STUDS = [8, 24, 40, 56, 72, 88, 104, 120, 136];
const FRAME: [number, number] = [0, D];
const TRACK = 2.4;

/** A pipe or conduit up the cavity, with a coupling partway up so it reads as a pipe. */
function riser(x: number, y: number, r: number, couplingAt: number): Piece[] {
  return [round('z', x, y, r, 1.4, H - TRACK), round('z', x, y, r * 1.35, couplingAt, couplingAt + 1.6)];
}

function layers(): Layer[] {
  const mid = (BEAM.x0 + BEAM.x1) / 2;
  const pocket = (x0: number, x1: number, keep: Keep): Piece => ({
    faces: extrude(rect(x0, H - BEAM.depth + 1, x1, H - 1), 'y', 0, D, keep),
  });
  return [
    { id: 'slab', material: 'concrete', pieces: [box(-4, L + 4, [FRONT - 4, BACK + 6], -5, 0)] },
    { id: 'board_s2_tape', material: 'tape', hidden: true, pieces: [box(5.5, 8.5, [S2L2[1], S2L2[1] + 0.3], 0.3, H - HOW_GAP)] },
    { id: 'board_s2_l2', material: 'board', pieces: board(0, S2L2, false) },
    { id: 'board_s2_l1', material: 'board', pieces: board(14, S2L1, false) },
    { id: 'bottom_track', material: 'steel', pieces: [box(0, L, FRAME, 0, 1.4)] },
    { id: 'cavity', material: 'wool', pieces: run(30, L, [0.5, D - 0.5], 1.4, H - TRACK) },
    { id: 'in_wall_plumbing', material: 'pipe', pieces: riser(17, 3, 1.6, 30) },
    { id: 'slab_firestop', material: 'sealant', pieces: [round('z', 17, 3, 2.6, 1.4, 3.2)] },
    { id: 'in_wall_hvac', material: 'pipe', pieces: riser(32.5, 2.2, 0.7, 40) },
    { id: 'in_wall_electrical', material: 'pipe', pieces: riser(47, 2.2, 1.1, 22) },
    { id: 'studs', material: 'steel', pieces: STUDS.map((s) => box(s - 0.8, s + 0.8, FRAME, 1.4, H - TRACK)) },
    { id: 'top_track', material: 'steel', pieces: run(0, L, FRAME, H - TRACK, H) },
    { id: 'beam', material: 'steel', pieces: [{ faces: extrude(beamProfile(), 'y', 0, D + G) }] },
    { id: 'beam_pockets', material: 'wool', pieces: [pocket(BEAM.x0, mid - 0.5, 'no-top'), pocket(mid + 0.5, BEAM.x1, 'cap')] },
    { id: 'deck', material: 'steel', pieces: [{ faces: extrude(sheetProfile(), 'y', 0, BACK + 6, 'no-under') }] },
    { id: 'topping', material: 'concrete', pieces: [{ faces: extrude(toppingProfile(), 'y', 0, BACK + 6, 'no-under') }] },
    { id: 'deck_flutes', material: 'foam', pieces: flutePlugs().map((p) => ({ faces: extrude(p, 'y', 0, D, 'cap') })) },
    { id: 'board_s1_l1', material: 'board', pieces: board(54, S1L1, true) },
    { id: 'head_of_wall_cavity', material: 'wool', pieces: run(54, L, S1L1, H - HOW_GAP, H) },
    { id: 'board_s1_l2', material: 'board', pieces: board(72, S1L2, true) },
    { id: 'control_joint', material: 'sealant', pieces: [box(CJ.x0, CJ.x1, [FRONT - 0.3, S1L1[1]], 0.3, H - HOW_GAP)] },
    { id: 'board_s1_tape', material: 'tape', pieces: [box(90.5, 93.5, [FRONT - 0.25, FRONT], 0.3, H - HOW_GAP)] },
    { id: 'head_of_wall_surface', material: 'sealant', pieces: run(72, L, [FRONT - 0.4, S1L2[1]], H - HOW_GAP - 1.6, H) },
    { id: 'box', material: 'steel', pieces: [box(78, 83, [FRONT - 0.6, FRONT], 22, 29), box(79.1, 81.9, [FRONT - 0.9, FRONT - 0.6], 23.2, 27.8)] },
    {
      id: 'in_wall_mechanical',
      material: 'pipe',
      pieces: [round('y', 100, 36, 3.6, FRONT - 0.8, FRONT), round('y', 100, 36, 2.4, FRONT - 6, FRONT - 0.8)],
    },
  ];
}

/** A point on each part that shows, for its leader. */
const ANCHORS: Record<WallPart, Vec3> = {
  deck_flutes: [26, 0, H + 1.4],
  top_track: [20, 0, H - 1.2],
  bottom_track: [26, 0, 0.7],
  head_of_wall_cavity: [63, S1L1[0], H - 0.9],
  head_of_wall_surface: [100, FRONT - 0.4, H - 2.4],
  beam_pockets: [BEAM.x0 + 1.7, 0, H - 4],
  studs: [24, 0, 34],
  cavity: [38, 0.5, 24],
  control_joint: [112, FRONT - 0.3, 14],
  board_s1_l1: [63, S1L1[0], 14],
  board_s1_l2: [118, FRONT, 46],
  board_s1_tape: [92, FRONT - 0.25, 10],
  board_s2_l1: [22, S2L1[0], 44],
  board_s2_l2: [4, S2L2[0], 44],
  board_s2_tape: [7, S2L2[1], 20],
  in_wall_electrical: [47, 1.1, 44],
  in_wall_plumbing: [17, 1.4, 20],
  in_wall_hvac: [32.5, 1.5, 48],
  in_wall_mechanical: [100, FRONT - 6, 36],
  box: [80.5, FRONT - 0.9, 25.5],
  slab_firestop: [17, 0.4, 2.3],
  whole_wall: [96, FRONT, 18],
};

/** Labels of parts high on the wall sit above it; the rest below it. */
const SLOTS: Record<WallPart, Slot> = {
  deck_flutes: 'top',
  top_track: 'top',
  bottom_track: 'bottom',
  head_of_wall_cavity: 'top',
  head_of_wall_surface: 'top',
  beam_pockets: 'top',
  studs: 'top',
  cavity: 'bottom',
  control_joint: 'bottom',
  board_s1_l1: 'bottom',
  board_s1_l2: 'top',
  board_s1_tape: 'bottom',
  board_s2_l1: 'top',
  board_s2_l2: 'top',
  board_s2_tape: 'bottom',
  in_wall_electrical: 'top',
  in_wall_plumbing: 'bottom',
  in_wall_hvac: 'top',
  in_wall_mechanical: 'bottom',
  box: 'bottom',
  slab_firestop: 'bottom',
  whole_wall: 'bottom',
};

function buildAssembly(): Assembly {
  const all = layers();
  const b = boundsOf(all.flatMap((l) => l.pieces.flatMap((p) => p.faces.flatMap((f) => f.pts))));
  // Room for a label above the wall's low left end and below its high right end.
  const view: Box = { minX: b.minX - 2, minY: b.minY - 12, maxX: b.maxX + 2, maxY: b.maxY + 10 };
  const anchors = Object.fromEntries(Object.entries(ANCHORS).map(([k, v]) => [k, project(v)])) as Record<WallPart, Pt>;
  return {
    layers: all,
    anchors,
    slots: SLOTS,
    edges: {
      top: [project([DECK_X[0], BACK + 6, DECK_TOP]), project([DECK_X[1], BACK + 6, DECK_TOP])],
      bottom: [project([-4, FRONT - 4, -5]), project([L + 4, FRONT - 4, -5])],
    },
    view,
  };
}

/** The one drawing, built once (it never changes). */
export const ASSEMBLY: Assembly = buildAssembly();
