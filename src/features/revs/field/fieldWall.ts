// A wall added on the spot (0113), worked out for its form: the tags the job's walls have (to pick from), the wall a
// typed tag would bring its rating, UL design and sheet number from (rev_field_wall_add's own pick: one with a UL
// first), the rooms of a level, and the four walls. Pure; tested in fieldWall.test.ts.
import type { RevRoom } from '../../../data/revs.rooms';
import type { RevArea } from '../../../data/revs.types';
import { sameLevel } from '../levels';

export const SIDES = [
  { value: 'north', label: 'North' },
  { value: 'south', label: 'South' },
  { value: 'east', label: 'East' },
  { value: 'west', label: 'West' },
  { value: 'other', label: 'Other' },
] as const;

/** The job's wall tags, each once, in natural order (A6k before A12). */
export function jobTags(areas: readonly Pick<RevArea, 'wall_tag'>[]): string[] {
  const seen = new Map<string, string>();
  for (const a of areas) {
    const t = a.wall_tag?.trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/** The wall a tag brings its details from: the first with that tag and a UL, else the first with that tag. */
export function tagSource<T extends Pick<RevArea, 'wall_tag' | 'ul_design'>>(areas: readonly T[], tag: string): T | null {
  const t = tag.trim().toLowerCase();
  if (t === '') return null;
  const same = areas.filter((a) => a.wall_tag?.trim().toLowerCase() === t);
  return same.find((a) => a.ul_design !== null) ?? same[0] ?? null;
}

/** A level's rooms of a list (rooms, then exterior and shafts), in their order. */
export function roomsOn(rooms: readonly RevRoom[], listId: string, level: string): RevRoom[] {
  return rooms.filter((r) => r.list_id === listId && sameLevel(r.level, level)).sort((a, b) => a.position - b.position);
}
