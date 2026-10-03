// The 3-D wall's sizes (nominal units, about an inch; not to scale), shared by the assembly and its deck.

/** Wall length, and the height of the deck's low flats over the slab. */
export const L = 140;
export const H = 60;
/** Stud depth, board thickness, and how far each board layer is pulled away from the next. */
export const D = 6;
const T = 1.4;
export const G = 2.6;
/** The head-of-wall joint: the gap between the boards' tops and the deck. */
export const HOW_GAP = 1.8;
/** The steel beam crossing the wall under the deck, and the control joint. */
export const BEAM = { x0: 122, x1: 134, depth: 10 } as const;
export const CJ = { x0: 111.4, x1: 112.6 } as const;

// Through the wall (y): the frame from 0 to D, the first side's layers in front, the second side's behind.
export const S1L2: [number, number] = [-2 * G - 2 * T, -2 * G - T];
export const S1L1: [number, number] = [-G - T, -G];
export const S2L1: [number, number] = [D + G, D + G + T];
export const S2L2: [number, number] = [D + 2 * G + T, D + 2 * G + 2 * T];
export const FRONT = S1L2[0];
export const BACK = S2L2[1];
