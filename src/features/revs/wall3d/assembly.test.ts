import { describe, expect, it } from 'vitest';
import { WALL_PARTS } from '../wallParts';
import { ASSEMBLY } from './assembly';
import { undersideAt } from './deck';
import { BEAM, H } from './dims';
import { mix, paintOf, shade } from './paint';
import { edgeY, labelSize, placeLabel } from './placeLabel';

const { layers, anchors, view, edges, slots } = ASSEMBLY;
const inside = ([x, y]: readonly [number, number]) => x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY;

describe('the wall assembly', () => {
  it('draws every part but the whole wall once, each with something to see', () => {
    const drawn = layers.map((l) => l.id).filter((id) => !['slab', 'deck', 'topping', 'beam'].includes(id));
    expect([...drawn].sort()).toEqual(WALL_PARTS.filter((p) => p !== 'whole_wall').sort());
    for (const l of layers) {
      expect(`${l.id}: ${String(l.pieces.length > 0 && l.pieces.every((p) => p.faces.length > 0))}`).toBe(`${l.id}: true`);
    }
  });

  it('starts with the slab and ends with what sits in front of the first side', () => {
    expect(layers[0]?.id).toBe('slab');
    const at = (id: string) => layers.findIndex((l) => l.id === id);
    expect(at('board_s2_l2')).toBeLessThan(at('studs'));
    expect(at('studs')).toBeLessThan(at('board_s1_l1'));
    expect(at('board_s1_l1')).toBeLessThan(at('board_s1_l2'));
    expect(at('board_s1_l2')).toBeLessThan(at('box'));
  });

  it("keeps every point and every part's anchor inside the drawing", () => {
    for (const l of layers) for (const p of l.pieces) for (const f of p.faces) for (const pt of f.pts) expect(inside(pt)).toBe(true);
    for (const part of WALL_PARTS) expect(`${part}: ${String(inside(anchors[part]))}`).toBe(`${part}: true`);
  });

  it('only the second side fire tape is hidden from this side', () => {
    expect(layers.filter((l) => l.hidden).map((l) => l.id)).toEqual(['board_s2_tape']);
  });

  it('runs the deck edge above the slab edge, both rising to the right', () => {
    expect(edges.top[1][1]).toBeLessThan(edges.top[0][1]);
    expect(edges.bottom[1][1]).toBeLessThan(edges.bottom[0][1]);
    expect(edges.top[0][1]).toBeLessThan(edges.bottom[0][1]);
  });

  it('bears the deck on the beam: a low flat over its middle', () => {
    expect(undersideAt((BEAM.x0 + BEAM.x1) / 2)).toBe(H);
    expect(undersideAt((BEAM.x0 + BEAM.x1) / 2 + 6)).toBe(H + 3);
  });
});

describe('the callout label', () => {
  it('wraps words onto lines no wider than asked, but never narrower than a long word', () => {
    expect(labelSize('CJ Stuffing', 200).h).toBe(21);
    const long = labelSize('In-Wall Final - OK to Cover - Slab firestopping/putty pads', 160);
    expect(long.w).toBeLessThanOrEqual(160);
    expect(long.h).toBeGreaterThan(21 * 2);
    const word = labelSize('firestopping/fireproofing', 100);
    expect(word.w).toBeGreaterThan(100);
  });

  it('reads a straight edge, held at its ends', () => {
    const e = [[0, 10], [10, 0]] as const;
    expect(edgeY(e, 5)).toBe(5);
    expect(edgeY(e, -5)).toBe(10);
    expect(edgeY(e, 50)).toBe(0);
  });

  it('sits clear of the deck or the slab and inside the drawing, for every part', () => {
    const size = { w: 40, h: 9 };
    for (const part of WALL_PARTS) {
      const { box, shoulder } = placeLabel({ anchor: anchors[part], slot: slots[part], size, view, edges });
      expect(`${part}: ${String(box.minX >= view.minX && box.maxX <= view.maxX && box.minY >= view.minY - 1e-9 && box.maxY <= view.maxY + 1e-9)}`).toBe(
        `${part}: true`,
      );
      if (slots[part] === 'top') {
        expect(box.maxY).toBeLessThanOrEqual(Math.min(edgeY(edges.top, box.minX), edgeY(edges.top, box.maxX)));
        expect(shoulder[1]).toBe(box.maxY);
      } else {
        expect(box.minY).toBeGreaterThanOrEqual(Math.max(edgeY(edges.bottom, box.minX), edgeY(edges.bottom, box.maxX)));
        expect(shoulder[1]).toBe(box.minY);
      }
      expect(shoulder[0]).toBeGreaterThanOrEqual(box.minX);
      expect(shoulder[0]).toBeLessThanOrEqual(box.maxX);
    }
  });

  it('slides along to where there is room instead of covering the wall', () => {
    const anchor = anchors.slab_firestop;
    const size = { w: 50, h: 20 };
    const { box } = placeLabel({ anchor, slot: 'bottom', size, view, edges });
    expect(box.minX).toBeGreaterThan(anchor[0] - size.w / 2);
    expect(box.minY).toBeGreaterThanOrEqual(Math.max(edgeY(edges.bottom, box.minX), edgeY(edges.bottom, box.maxX)));
  });
});

describe('paint', () => {
  it('mixes colors and shades darker', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#123456', '#123456', 0.3)).toBe('#123456');
    expect(shade('#FFFFFF', 0)).toBe('#FFFFFF');
    expect(shade('#FFFFFF', 0.16)).not.toBe('#FFFFFF');
  });

  it('tints a part by its state from lib/status; open is the plain drawing; N/A is faint', () => {
    const open = paintOf('board', 'open');
    expect(paintOf('board', undefined)).toEqual(open);
    expect(paintOf('board', 'passed').fill).not.toBe(open.fill);
    expect(paintOf('board', 'failed').stroke).not.toBe(paintOf('board', 'passed').stroke);
    expect(paintOf('board', 'requested').faint).toBe(false);
    expect(paintOf('board', 'na').faint).toBe(true);
    // The slab, deck and beam never take a state.
    expect(paintOf('concrete', 'failed', true)).toEqual(paintOf('concrete', undefined, true));
  });
});
