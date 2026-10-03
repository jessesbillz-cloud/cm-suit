// The parts of a fire-rated stud wall assembly, the pieces a rev item inspects (Jesse, Oct 3: "first layer of drywall,
// there it is"), and a guess at which part an item is from its own and its rev's names. Generic construction knowledge
// only. Later the part will come from the job's submittals and plans; partOf is the one place to swap for that data.

export const WALL_PARTS = [
  'deck_flutes',
  'top_track',
  'bottom_track',
  'head_of_wall_cavity',
  'head_of_wall_surface',
  'beam_pockets',
  'studs',
  'cavity',
  'control_joint',
  'board_s1_l1',
  'board_s1_l2',
  'board_s1_tape',
  'board_s2_l1',
  'board_s2_l2',
  'board_s2_tape',
  'in_wall_electrical',
  'in_wall_plumbing',
  'in_wall_hvac',
  'in_wall_mechanical',
  'box',
  'slab_firestop',
  'whole_wall',
] as const;

export type WallPart = (typeof WALL_PARTS)[number];

/** Each part's own short name, for a part tapped on the drawing that no item names. */
export const PART_LABELS: Record<WallPart, string> = {
  deck_flutes: 'Deck flutes',
  top_track: 'Top track',
  bottom_track: 'Bottom track',
  head_of_wall_cavity: 'Head of wall, cavity',
  head_of_wall_surface: 'Head of wall, surface',
  beam_pockets: 'Beam pockets',
  studs: 'Studs',
  cavity: 'Cavity insulation',
  control_joint: 'Control joint',
  board_s1_l1: 'First side, first layer',
  board_s1_l2: 'First side, second layer',
  board_s1_tape: 'First side, fire tape',
  board_s2_l1: 'Second side, first layer',
  board_s2_l2: 'Second side, second layer',
  board_s2_tape: 'Second side, fire tape',
  in_wall_electrical: 'In-wall electrical',
  in_wall_plumbing: 'In-wall plumbing',
  in_wall_hvac: 'In-wall HVAC',
  in_wall_mechanical: 'In-wall mechanical',
  box: 'Electrical box',
  slab_firestop: 'Slab firestopping',
  whole_wall: 'Whole wall',
};

const has = (text: string, re: RegExp) => re.test(text);

const SIDE_2 = /\b(second|2nd)\s+side\b|\bside\s*(2|two|b)\b/;
const LAYER_1 = /\b(first|1st|base)\s+layer\b|\blayer\s*(1|one)\b/;
const LAYER_2 = /\b(second|2nd|face)\s+layer\b|\blayer\s*(2|two)\b/;

/** A drywall layer or fire tape, by side (first side unless the second is named). */
function boardOf(t: string): WallPart | null {
  const side2 = has(t, SIDE_2);
  if (has(t, /\btape\b/)) return side2 ? 'board_s2_tape' : 'board_s1_tape';
  if (has(t, LAYER_2)) return side2 ? 'board_s2_l2' : 'board_s1_l2';
  if (has(t, LAYER_1)) return side2 ? 'board_s2_l1' : 'board_s1_l1';
  return null;
}

/** What is in the wall: electrical, plumbing, HVAC (controls), mechanical. */
function inWallOf(t: string): WallPart | null {
  if (has(t, /\belectric/)) return 'in_wall_electrical';
  if (has(t, /\bplumb/)) return 'in_wall_plumbing';
  if (has(t, /\bhvac\b|\bcontrols?\b/)) return 'in_wall_hvac';
  if (has(t, /\bmech(anical)?\b/)) return 'in_wall_mechanical';
  return null;
}

/** The head of the wall: its cavity side or its surface (HOW: head of wall). */
function headOf(t: string): WallPart | null {
  const head = has(t, /\bhow\b|\bhead\s+of\s+(the\s+)?wall\b/);
  if (head && has(t, /\bsurface\b/)) return 'head_of_wall_surface';
  if (has(t, /\bcavity\b/) && (head || has(t, /\b(stuff|stuffing|spray)\b/))) return 'head_of_wall_cavity';
  if (head) return 'head_of_wall_cavity';
  return null;
}

/** One text's guess; null when nothing in it names a part. Order matters: the narrower names first. */
function guess(text: string): WallPart | null {
  const t = text.toLowerCase().replace(/[–—_/]/g, ' ');
  if (has(t, /\bspeed\s*plugs?\b|\btow\b|\btop\s+of\s+(the\s+)?wall\b|\bflutes?\b/)) return 'deck_flutes';
  if (has(t, /\bbeam\s*pockets?\b/)) return 'beam_pockets';
  if (has(t, /\bslab\b|\bputty\b/)) return 'slab_firestop';
  if (has(t, /\bbox(es)?\b/)) return 'box';
  if (has(t, /\bcj\b|\bcontrol\s+joints?\b/)) return 'control_joint';
  const head = headOf(t);
  if (head) return head;
  const board = boardOf(t);
  if (board) return board;
  if (has(t, /\bin[\s-]?wall\b/) || has(t, /\b(electrical|plumbing|hvac|mechanical)\b/)) {
    const inWall = inWallOf(t);
    if (inWall) return inWall;
  }
  if (has(t, /\bfinal\b|\bok\s+to\s+cover\b/)) return 'whole_wall';
  if (has(t, /\bbottom\s+track\b/) && !has(t, /\btop\b/)) return 'bottom_track';
  if (has(t, /\btracks?\b|\bdeflection\b/)) return 'top_track';
  if (has(t, /\bstuds?\b|\bfram(e|ing)\b/)) return 'studs';
  if (has(t, /\binsulation\b|\bbatts?\b|\bmineral\s+wool\b|\bsound\b/)) return 'cavity';
  return null;
}

/**
 * The part an item inspects, guessed from its name and then its rev's ("Stuff" in "HOW - Surface" is the head of wall's
 * surface). Anything else is the whole wall.
 */
export function partOf(itemName: string, revName: string): WallPart {
  return guess(itemName) ?? guess(`${itemName} ${revName}`) ?? 'whole_wall';
}
