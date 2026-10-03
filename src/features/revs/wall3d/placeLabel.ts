// Where the focused part's label goes: above the wall (clear of the deck) or below it (clear of the slab), over the
// part where it fits, else slid along toward where the drawing leaves more room, with a shoulder line on its wall side
// for the leader to meet. Sizes come from the text and the drawing's width on screen, so the label wraps the same way
// on a phone and on a desktop. Pure.
import type { Slot } from './assembly';
import type { Box, Pt } from './iso';

const CHAR_PX = 7.2;
const LINE_PX = 17;
const PAD_PX = 10;

/** The label's size in pixels, about maxPx wide at most (never narrower than its longest word): a rough 13px measure. */
export function labelSize(text: string, maxPx: number): { w: number; h: number } {
  const words = text.split(/\s+/).filter(Boolean);
  const longest = Math.max(0, ...words.map((w) => w.length * CHAR_PX));
  const limit = Math.max(maxPx, longest + PAD_PX);
  const lines: number[] = [];
  for (const word of words) {
    const wpx = word.length * CHAR_PX;
    const last = lines.length - 1;
    const cur = lines[last];
    if (cur !== undefined && cur + CHAR_PX + wpx + PAD_PX <= limit) lines[last] = cur + CHAR_PX + wpx;
    else lines.push(wpx);
  }
  return { w: Math.max(0, ...lines) + PAD_PX, h: Math.max(1, lines.length) * LINE_PX + 4 };
}

/** The y of a straight edge at x (held at its ends beyond them). */
export function edgeY([a, b]: readonly [Pt, Pt], x: number): number {
  const t = Math.min(1, Math.max(0, (x - a[0]) / (b[0] - a[0] || 1)));
  return a[1] + (b[1] - a[1]) * t;
}

export interface Placed {
  /** The label's box, in drawing units. */
  box: Box;
  /** Where the leader meets the shoulder. */
  shoulder: Pt;
}

interface PlaceArgs {
  anchor: Pt;
  slot: Slot;
  /** The label's size in drawing units. */
  size: { w: number; h: number };
  view: Box;
  edges: { top: readonly [Pt, Pt]; bottom: readonly [Pt, Pt] };
}

const GAP = 2.5;
const STEPS = 10;

/** The label with its left side at `left`, and how much room it has to spare (negative: it doesn't fit). */
function at({ slot, size, view, edges }: PlaceArgs, left: number): { box: Box; room: number } {
  const right = left + size.w;
  if (slot === 'top') {
    const bottom = Math.min(edgeY(edges.top, left), edgeY(edges.top, right)) - GAP;
    return { box: { minX: left, maxX: right, minY: bottom - size.h, maxY: bottom }, room: bottom - size.h - view.minY };
  }
  const top = Math.max(edgeY(edges.bottom, left), edgeY(edges.bottom, right)) + GAP;
  return { box: { minX: left, maxX: right, minY: top, maxY: top + size.h }, room: view.maxY - top - size.h };
}

export function placeLabel(args: PlaceArgs): Placed {
  const { anchor, slot, size, view } = args;
  const lo = view.minX + 1;
  const hi = Math.max(lo, view.maxX - 1 - size.w);
  const clampX = (x: number) => Math.min(Math.max(x, lo), hi);
  const start = clampX(anchor[0] - size.w / 2);
  // The deck rises to the right, so a cramped label above slides left; below, the slab rises, so it slides right.
  const step = ((slot === 'top' ? lo - start : hi - start) / STEPS) || 0;
  let best = at(args, start);
  for (let i = 1; i <= STEPS && best.room < 0; i += 1) {
    const next = at(args, start + step * i);
    if (next.room > best.room) best = next;
  }
  const box = best.room >= 0 ? best.box : shiftInto(best.box, view, slot);
  const sx = Math.min(Math.max(anchor[0], box.minX + 2), box.maxX - 2);
  return { box, shoulder: [sx, slot === 'top' ? box.maxY : box.minY] };
}

/** Still no room: keep the label inside the drawing (it may sit over the deck or the slab's edge). */
function shiftInto(box: Box, view: Box, slot: Slot): Box {
  const h = box.maxY - box.minY;
  if (slot === 'top') return { ...box, minY: view.minY, maxY: view.minY + h };
  return { ...box, minY: view.maxY - h, maxY: view.maxY };
}
