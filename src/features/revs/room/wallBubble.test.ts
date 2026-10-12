import { describe, expect, it } from 'vitest';
import { bubbleNames } from './wallBubble';

type Wall = { id: string; name: string; wall_tag: string | null };
const w = (id: string, name: string, wall_tag: string | null = null): Wall => ({ id, name, wall_tag });
const room = (number: string, name: string) => ({ number, name });
const names = (r: { number: string; name: string }, walls: Wall[]) => [...bubbleNames(r, walls).values()];

describe('bubbleNames', () => {
  it('a compass wall is its side, the tag and brackets left off', () => {
    expect(
      names(room('0134', 'Main Electrical'), [
        w('a', 'Main Electrical 0134 north wall (D6a)', 'D6a'),
        w('b', 'MPOE 0127 east wall (to Electrical Engineering Research Lab 0123) (D6j)', 'D6j'),
      ]),
    ).toEqual(['North wall', 'Wall to MPOE 0127']);
    expect(names(room('0127', 'MPOE'), [w('b', 'MPOE 0127 east wall (to Electrical Engineering Research Lab 0123) (D6j)', 'D6j')])).toEqual([
      'East wall',
    ]);
    expect(names(room('E001', 'Elevator E001'), [w('a', 'Elevator E001 hoistway south wall (F6a)', 'F6a')])).toEqual(['South wall']);
    expect(names(room('0242', 'Electrical'), [w('a', 'South wall of Electrical 0242 / IDF 0240 core (D6a)', 'D6a')])).toEqual(['South wall']);
    expect(names(room('EXT', 'Exterior'), [w('a', 'West exterior wall (2-hr run - north portion of Area A) (CP1c)', 'CP1c')])).toEqual([
      'West exterior wall',
    ]);
  });

  it('a wall between two rooms is the wall to the other one', () => {
    const between = w('a', 'Wall between Main Electrical 0134 and Emergency Electrical 0134B (D6a)', 'D6a');
    expect(names(room('0134', 'Main Electrical'), [between])).toEqual(['Wall to Emergency Electrical 0134B']);
    expect(names(room('0134B', 'Emergency Electrical'), [between])).toEqual(['Wall to Main Electrical 0134']);
  });

  it("a name that starts with the room's is the rest; anything else as it is", () => {
    expect(names(room('M0200', 'Mech Shaft M0200'), [w('a', 'Mech Shaft M0200 enclosure (shaft at west side of Level 02 electrical core) (K4a)', 'K4a')])).toEqual([
      'Enclosure',
    ]);
    expect(names(room('E002', 'Elevator E002'), [w('a', 'Elevator E002 hoistway enclosure (all sides)')])).toEqual(['Hoistway enclosure']);
    expect(
      names(room('EXT', 'Exterior'), [
        w('a', 'Shaft wall east of MDF 0142 (narrow chase - second leg) (F4a)', 'F4a'),
        w('b', '1-hr shaft wall (small chase - Area A) (G2a)', 'G2a'),
        w('c', 'Exterior wall 1-hr run (Area B) (CP1b)', 'CP1b'),
      ]),
    ).toEqual(['Shaft wall east of MDF 0142', '1-hr shaft wall', 'Exterior wall 1-hr run']);
    expect(
      names(room('EXT', 'Exterior'), [
        w('a', 'Exterior wall 1-hr run - fiber cement'),
        w('b', 'North exterior wall 1-hr run'),
      ]),
    ).toEqual(['Exterior wall 1-hr run - fiber cement', 'North exterior wall']);
  });

  it('equal bubbles add the tag, then a number', () => {
    expect(
      names(room('0142', 'MDF'), [
        w('a', 'Shaft wall east of MDF 0142 (first leg) (F4a)', 'F4a'),
        w('b', 'Shaft wall east of MDF 0142 (narrow chase - second leg) (F4b)', 'F4b'),
        w('c', 'MDF 0142 north wall (D6a)', 'D6a'),
      ]),
    ).toEqual(['Shaft wall east of MDF 0142 · F4a', 'Shaft wall east of MDF 0142 · F4b', 'North wall']);
    expect(names(room('110', 'Corridor'), [w('a', 'Corridor 110 north wall (B / 2–5)'), w('b', 'Corridor 110 north wall (C / 2–5)')])).toEqual([
      'North wall 1',
      'North wall 2',
    ]);
  });
});
