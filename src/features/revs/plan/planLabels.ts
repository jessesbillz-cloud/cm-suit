// Where each wall's callout sits on the plan, in screen pixels (the labels keep their size while the sheet zooms):
// beside the wall's midpoint, on either side of it, then above, below, right or left, wherever it is on screen and
// clear of the labels placed before it (the first wall, e.g. the one being looked at, places first). A label with no
// room is left off until a zoom makes room; its wall still shows and still opens on a tap. Pure; tested in
// planLabels.test.ts.
import type { Box, Pt } from './planGeom';

const CHAR_PX = 6.9;
const LINE_PX = 15;
/** The dot and the padding around the words. */
const PAD_PX = 22;
const MAX_W = 196;
const GAP_PX = 8;

/** A label's size: one line up to MAX_W, wrapping at words beyond it (a rough 12px measure). */
export function labelSize(text: string): { w: number; h: number } {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: number[] = [];
  for (const word of words) {
    const wpx = word.length * CHAR_PX;
    const last = lines.length - 1;
    const cur = lines[last];
    if (cur !== undefined && cur + CHAR_PX + wpx + PAD_PX <= MAX_W) lines[last] = cur + CHAR_PX + wpx;
    else lines.push(wpx);
  }
  return { w: Math.min(MAX_W, Math.max(0, ...lines) + PAD_PX), h: Math.max(1, lines.length) * LINE_PX + 8 };
}

interface LabelIn {
  id: string;
  text: string;
  /** The wall's midpoint on screen. */
  at: Pt;
  /** The wall's direction there (a unit vector). */
  dir: Pt;
}

interface LabelOut {
  id: string;
  box: Box;
  at: Pt;
  /** Where the leader from the wall meets the label. */
  tip: Pt;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w + 3 && b.x < a.x + a.w + 3 && a.y < b.y + b.h + 3 && b.y < a.y + a.h + 3;

const inside = (b: Box, frame: { w: number; h: number }) => b.x >= 2 && b.y >= 2 && b.x + b.w <= frame.w - 2 && b.y + b.h <= frame.h - 2;

export function placeLabels(labels: readonly LabelIn[], frame: { w: number; h: number }): LabelOut[] {
  const placed: LabelOut[] = [];
  for (const l of labels) {
    const [ax, ay] = l.at;
    if (ax < 0 || ay < 0 || ax > frame.w || ay > frame.h) continue;
    const { w, h } = labelSize(l.text);
    const n: Pt = [-l.dir[1], l.dir[0]];
    const ways: Pt[] = [n, [-n[0], -n[1]], [0, -1], [0, 1], [1, 0], [-1, 0]];
    for (const [ux, uy] of ways) {
      const reach = GAP_PX + Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2);
      const box = { x: ax + ux * reach - w / 2, y: ay + uy * reach - h / 2, w, h };
      if (!inside(box, frame) || placed.some((p) => overlaps(p.box, box))) continue;
      const tip: Pt = [Math.min(box.x + w, Math.max(box.x, ax)), Math.min(box.y + h, Math.max(box.y, ay))];
      placed.push({ id: l.id, box, at: l.at, tip });
      break;
    }
  }
  return placed;
}
