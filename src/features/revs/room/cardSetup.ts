// A room's inspection card worked out (0101, 0119; Jesse, Oct 12: "for these two, what do we need? ... everything else
// should just go away"; Oct 23: "click what inspections we need to achieve, and save it"). One row per wall of the room
// (its bubble name), one column per item of the list under its rev, and an "All walls" row on top. Each box in a word
// (lib/status CARD_STATE): Needed, Not needed, or kept as it is (Signed off, Asked for, Failed: a sign-off or a request,
// which Setup never changes). A tap turns Needed and Not needed over; the changes are kept apart until Save. All walls
// says Needed, Not needed or Some, and a tap makes the item needed on every wall (not needed when it already is).
// Pure; tested in cardSetup.test.ts.
import type { CardCellChange } from '../../../data/revs.card';
import type { RevRoom, RevRooms } from '../../../data/revs.rooms';
import type { Rev, RevArea, RevItem, RevSetup } from '../../../data/revs.types';
import type { CardState } from '../../../lib/status';
import { shortItem } from '../itemLines';
import { cellOf, type StatusIndex } from '../model';
import { bubbleNames } from './wallBubble';

export interface CardWall {
  area: RevArea;
  /** Its bubble in the room. */
  title: string;
}

/** The room's walls, in its order. */
export function cardWalls(setup: RevSetup, rooms: RevRooms, room: RevRoom): CardWall[] {
  const inIt = rooms.walls.filter((w) => w.room_id === room.id).flatMap((w) => setup.areas.find((a) => a.id === w.area_id) ?? []);
  const names = bubbleNames(room, inIt);
  return inIt.map((area) => ({ area, title: names.get(area.id) ?? area.name }));
}

interface CardItem {
  item: RevItem;
  /** Its name under its rev's ("Speed Plugs" under "TOW"). */
  short: string;
}

export interface CardRev {
  rev: Rev;
  items: CardItem[];
}

/** The list's items under their revs (revs with none left out). */
export function cardRevs(setup: RevSetup, listId: string): CardRev[] {
  return setup.revs
    .filter((r) => r.list_id === listId)
    .map((rev) => ({ rev, items: setup.items.filter((i) => i.rev_id === rev.id).map((item) => ({ item, short: shortItem(item.name, rev.name) })) }))
    .filter((r) => r.items.length > 0);
}

/** A box as the database has it: its state and when (a sign-off's day, when it was asked for, failed). */
export interface BoxNow {
  state: CardState;
  at: string | null;
}

const OF_STATUS = { passed: 'signed_off', requested: 'asked_for', failed: 'failed', open: 'needed', na: 'not_needed' } as const;

export function boxNow(index: StatusIndex, areaId: string, itemId: string): BoxNow {
  const cell = cellOf(index, areaId, itemId);
  return { state: OF_STATUS[cell.status], at: cell.at };
}

/** A sign-off or a request: Setup never changes it. */
export function isKept(state: CardState): boolean {
  return state === 'signed_off' || state === 'asked_for' || state === 'failed';
}

/** The boxes changed and not saved yet: wall:item to needed. */
export type CardChanges = ReadonlyMap<string, boolean>;

export const boxKey = (areaId: string, itemId: string) => `${areaId}:${itemId}`;

/** What the box shows now: its change, else as saved. */
export function boxShown(now: BoxNow, changes: CardChanges, key: string): CardState {
  if (isKept(now.state)) return now.state;
  const want = changes.get(key);
  if (want === undefined) return now.state;
  return want ? 'needed' : 'not_needed';
}

/** One box turned over; back as saved, it is no longer a change. A kept box stays as it is. */
export function flipBox(changes: CardChanges, now: BoxNow, key: string): CardChanges {
  if (isKept(now.state)) return changes;
  const next = new Map(changes);
  const want = boxShown(now, changes, key) !== 'needed';
  if (want === (now.state === 'needed')) next.delete(key);
  else next.set(key, want);
  return next;
}

/** The All walls box of an item: every changeable wall needed, none, some; locked when every wall is kept. */
type AllWalls = 'needed' | 'not_needed' | 'some' | 'locked';

export function allWalls(index: StatusIndex, walls: readonly CardWall[], itemId: string, changes: CardChanges): AllWalls {
  const shown = walls
    .map((w) => ({ now: boxNow(index, w.area.id, itemId), key: boxKey(w.area.id, itemId) }))
    .filter((b) => !isKept(b.now.state))
    .map((b) => boxShown(b.now, changes, b.key));
  if (shown.length === 0) return 'locked';
  if (shown.every((s) => s === 'needed')) return 'needed';
  if (shown.every((s) => s === 'not_needed')) return 'not_needed';
  return 'some';
}

/** A tap on All walls: needed on every wall, or (already) not needed on any. Kept boxes stay. */
export function setAllWalls(index: StatusIndex, walls: readonly CardWall[], itemId: string, changes: CardChanges): CardChanges {
  const want = allWalls(index, walls, itemId, changes) !== 'needed';
  const next = new Map(changes);
  for (const w of walls) {
    const now = boxNow(index, w.area.id, itemId);
    if (isKept(now.state)) continue;
    const key = boxKey(w.area.id, itemId);
    if (want === (now.state === 'needed')) next.delete(key);
    else next.set(key, want);
  }
  return next;
}

/** What Save sends. */
export function changeList(changes: CardChanges): CardCellChange[] {
  return [...changes].map(([key, needed]) => {
    const [area_id = '', item_id = ''] = key.split(':');
    return { area_id, item_id, needed };
  });
}

/** "1 change", "3 changes", or none. */
export function changesLine(n: number): string {
  if (n === 0) return 'No changes';
  return n === 1 ? '1 change' : `${String(n)} changes`;
}
