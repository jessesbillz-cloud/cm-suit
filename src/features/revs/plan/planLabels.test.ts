import { describe, expect, it } from 'vitest';
import { labelSize, placeLabels } from './planLabels';

const frame = { w: 400, h: 300 };

describe('labelSize', () => {
  it('one line for a short name, wrapped at words for a long one, never wider than the cap', () => {
    expect(labelSize('Corridor 110').h).toBe(23);
    const long = labelSize('Shaftwall at Stair 2 beside the east corridor');
    expect(long.h > 23 && long.w <= 196).toBe(true);
  });
});

describe('placeLabels', () => {
  it('beside a level wall, above or below it', () => {
    const [l] = placeLabels([{ id: 'a', text: 'Corridor 110', at: [200, 150], dir: [1, 0] }], frame);
    expect(l?.box.x).toBe(200 - (l?.box.w ?? 0) / 2);
    expect((l?.box.y ?? 0) > 150 || (l?.box.y ?? 0) + (l?.box.h ?? 0) < 150).toBe(true);
  });
  it('the second label goes to the other side instead of on top of the first', () => {
    const out = placeLabels([
      { id: 'a', text: 'Corridor 110', at: [200, 150], dir: [1, 0] },
      { id: 'b', text: 'Corridor 111', at: [205, 150], dir: [1, 0] },
    ], frame);
    expect(out).toHaveLength(2);
    const [a, b] = out;
    expect(Math.sign((a?.box.y ?? 0) - 150)).toBe(-Math.sign((b?.box.y ?? 0) - 150));
  });
  it('stays on screen, leaves off a wall that is off screen and one with no room left', () => {
    const edge = placeLabels([{ id: 'a', text: 'Elevator 1', at: [200, 4], dir: [1, 0] }], frame);
    expect((edge[0]?.box.y ?? -1) >= 2).toBe(true);
    expect(placeLabels([{ id: 'a', text: 'Elevator 1', at: [-20, 40], dir: [1, 0] }], frame)).toEqual([]);
    const crowd = Array.from({ length: 12 }, (_, i) => ({
      id: String(i), text: 'Shaftwall at Stair 2', at: [30, 30] as [number, number], dir: [1, 0] as [number, number],
    }));
    expect(placeLabels(crowd, { w: 120, h: 80 }).length < 12).toBe(true);
  });
  it('the leader meets the label at its nearest edge', () => {
    const [l] = placeLabels([{ id: 'a', text: 'Corridor 110', at: [200, 150], dir: [1, 0] }], frame);
    expect(l?.tip[0]).toBe(200);
    expect(l?.tip[1] === l?.box.y || l?.tip[1] === (l?.box.y ?? 0) + (l?.box.h ?? 0)).toBe(true);
  });
});
