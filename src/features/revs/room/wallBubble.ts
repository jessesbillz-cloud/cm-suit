// Each wall's bubble in its room (Jesse, Oct 12: "the little bubble tag boxes for just 'east wall', 'north wall' ...
// associate what's on the plan sheet, those bubbles that you can follow, with what you have showing up below that"):
// one short name per wall, the same on the room's picture and on its row. Its tag and grid brackets dropped first
// (calloutOf), then: a compass wall ("North wall", "West exterior wall") unless another room's wall ("Corridor 210
// north wall" in 205 is "Wall to Corridor 210"); "Wall between X and Y" is the wall to the side that isn't this room;
// a name starting with the room's own name or number is the rest ("Enclosure"); else the name as is. Two walls with
// the same bubble add the tag, then a number. Pure; tested in wallBubble.test.ts.
import type { RevRoom } from '../../../data/revs.rooms';
import type { RevArea } from '../../../data/revs.types';
import { calloutOf } from '../wallPage';

type Room = Pick<RevRoom, 'number' | 'name'>;
type Wall = Pick<RevArea, 'id' | 'name' | 'wall_tag'>;

const COMPASS = /\b((?:north|south)?(?:east|west)|north|south)(\s+exterior)?\s+wall\b/i;
const BETWEEN = /^wall\s+between\s+(.+?)\s+and\s+(.+)$/i;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const norm = (t: string) => t.toLowerCase().replace(/^0+(?=\w)/, '');

/** The words with a digit in them ("0134", "E001", "S2"): how a room is told apart. */
function numbers(s: string): string[] {
  return (s.match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => /\d/.test(t)).map(norm);
}

function roomNumbers(room: Room): Set<string> {
  return new Set([...numbers(room.number), ...numbers(room.name)]);
}

/** A side that names another room (a number this room doesn't have). */
function namesOther(text: string, own: Set<string>): boolean {
  const its = numbers(text);
  return its.length > 0 && !its.some((n) => own.has(n));
}

function namesThis(text: string, own: Set<string>): boolean {
  return numbers(text).some((n) => own.has(n));
}

/** The name with the room's own name or number at its start left off, or null. */
function afterRoom(title: string, room: Room): string | null {
  const heads = [`${room.name} ${room.number}`, `${room.number} ${room.name}`, room.name, room.number]
    .map((h) => h.trim())
    .filter((h) => h !== '')
    .sort((a, b) => b.length - a.length);
  const lower = title.toLowerCase();
  for (const h of heads) {
    if (!lower.startsWith(h.toLowerCase())) continue;
    const next = title.charAt(h.length);
    if (next !== '' && /[\p{L}\p{N}]/u.test(next)) continue;
    const rest = title.slice(h.length).replace(/^[\s\-–—:·/,]+/, '').trim();
    if (rest !== '') return cap(rest);
  }
  return null;
}

/** One wall's bubble, before telling equal ones apart. */
function bubbleOf(room: Room, wall: Pick<Wall, 'name' | 'wall_tag'>): string {
  const { title } = calloutOf(wall.name, wall.wall_tag);
  const own = roomNumbers(room);
  const compass = COMPASS.exec(title);
  if (compass?.[1]) {
    const before = title.slice(0, compass.index).trim();
    if (before !== '' && namesOther(before, own)) return `Wall to ${before}`;
    return cap(`${compass[1].toLowerCase()}${compass[2] ? ' exterior' : ''} wall`);
  }
  const between = BETWEEN.exec(title);
  if (between?.[1] && between[2]) {
    const [x, y] = [between[1].trim(), between[2].trim()];
    if (namesThis(x, own) && !namesThis(y, own)) return `Wall to ${y}`;
    if (namesThis(y, own) && !namesThis(x, own)) return `Wall to ${x}`;
    return title;
  }
  return afterRoom(title, room) ?? title;
}

const key = (s: string) => s.toLowerCase();

/** Groups the names that are still equal. */
function equalOnes(names: Map<string, string>): string[][] {
  const by = new Map<string, string[]>();
  for (const [id, n] of names) by.set(key(n), [...(by.get(key(n)) ?? []), id]);
  return [...by.values()].filter((ids) => ids.length > 1);
}

/** Every wall's bubble in its room, each one different: equal ones add the wall's tag, then a number. */
export function bubbleNames(room: Room, walls: readonly Wall[]): Map<string, string> {
  const names = new Map(walls.map((w) => [w.id, bubbleOf(room, w)]));
  const tags = new Map(walls.map((w) => [w.id, w.wall_tag?.trim() ?? '']));
  for (const ids of equalOnes(names)) {
    for (const id of ids) {
      const tag = tags.get(id);
      if (tag) names.set(id, `${names.get(id) ?? ''} · ${tag}`);
    }
  }
  for (const ids of equalOnes(names)) {
    ids.forEach((id, i) => {
      names.set(id, `${names.get(id) ?? ''} ${String(i + 1)}`);
    });
  }
  return names;
}
