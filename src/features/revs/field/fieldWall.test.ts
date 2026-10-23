import { describe, expect, it } from 'vitest';
import type { RevRoom } from '../../../data/revs.rooms';
import { jobTags, roomsOn, tagSource } from './fieldWall';

const wall = (id: string, wall_tag: string | null, ul_design: string | null) => ({ id, wall_tag, ul_design });

describe('a wall added on the spot', () => {
  it('offers the job tags once, in natural order', () => {
    expect(jobTags([wall('1', 'A12', null), wall('2', 'A6k', null), wall('3', ' a6k ', null), wall('4', null, null)])).toEqual(['A6k', 'A12']);
  });

  it('a tag brings its details from a wall with that tag and a UL first', () => {
    const areas = [wall('1', 'F6a', null), wall('2', 'f6a', 'UL U419'), wall('3', 'D6j', 'UL W419')];
    expect(tagSource(areas, 'F6A')?.id).toBe('2');
    expect(tagSource(areas, 'D6j')?.id).toBe('3');
    expect(tagSource(areas, 'X1')).toBeNull();
    expect(tagSource(areas, '  ')).toBeNull();
  });

  it("lists a level's rooms of the card's list in their order", () => {
    const room = (id: string, list: string, level: string, position: number) =>
      ({ id, list_id: list, level, position }) as RevRoom;
    const rooms = [room('b', 'l1', 'Level 03', 2), room('a', 'l1', 'Level 3', 1), room('c', 'l2', 'Level 03', 1), room('d', 'l1', 'Level 02', 1)];
    expect(roomsOn(rooms, 'l1', 'Level 03').map((r) => r.id)).toEqual(['a', 'b']);
  });
});
