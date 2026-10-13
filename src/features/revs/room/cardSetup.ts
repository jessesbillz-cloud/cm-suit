// A room's inspection card worked out (0101; Jesse, Oct 12: "here's the MPOE ... we got these two interior walls right
// here, the exterior wall is another rating ... we'll track it with the exterior. For these two, what do we need? Speed
// plugs, framing ... and everything else should just go away"). The walls: every wall in the room, on, and the ones
// taken out of it before, off (a tap puts one back). The items: every item of the room's list under its rev. An item
// with a sign-off, a request or a failure on a wall kept is locked on, in its state. Picked to start with: what the
// card already has (an item still needed on a kept wall) once set up, else nothing. Pure; tested in cardSetup.test.ts.
import type { RevRoom, RevRooms } from '../../../data/revs.rooms';
import type { Rev, RevArea, RevItem, RevSetup } from '../../../data/revs.types';
import type { BoxState } from '../boxLook';
import { shortItem } from '../itemLines';
import { cellOf, type StatusIndex } from '../model';
import { bubbleNames } from './wallBubble';

interface CardWall {
  area: RevArea;
  /** Its bubble in the room. */
  title: string;
  /** In the room now. */
  inRoom: boolean;
}

/** The room's walls (in its order), then the ones taken out of it, each once. */
export function cardWalls(setup: RevSetup, rooms: RevRooms, room: RevRoom): CardWall[] {
  const areaOf = (id: string) => setup.areas.find((a) => a.id === id);
  const inIt = rooms.walls.filter((w) => w.room_id === room.id).flatMap((w) => areaOf(w.area_id) ?? []);
  const ids = new Set(inIt.map((a) => a.id));
  const out = rooms.out.filter((w) => w.room_id === room.id && !ids.has(w.area_id)).flatMap((w) => areaOf(w.area_id) ?? []);
  const names = bubbleNames(room, [...inIt, ...out]);
  return [
    ...inIt.map((area) => ({ area, title: names.get(area.id) ?? area.name, inRoom: true })),
    ...out.map((area) => ({ area, title: names.get(area.id) ?? area.name, inRoom: false })),
  ];
}

export interface CardItem {
  item: RevItem;
  /** Its name under its rev's ("Speed Plugs" under "TOW"). */
  short: string;
  /** A sign-off, a request or a failure on a kept wall: locked on, in that state (failed first, then requested). */
  locked: BoxState | null;
}

interface CardRev {
  rev: Rev;
  items: CardItem[];
}

const LOCK_ORDER: readonly BoxState[] = ['failed', 'requested', 'passed'];

function lockOf(index: StatusIndex, itemId: string, areaIds: readonly string[]): BoxState | null {
  const its = new Set(areaIds.map((a) => cellOf(index, a, itemId).status));
  return LOCK_ORDER.find((s) => its.has(s)) ?? null;
}

/** The list's items under their revs (revs with none left out), each locked or not on the kept walls. */
export function cardRevs(setup: RevSetup, index: StatusIndex, listId: string, areaIds: readonly string[]): CardRev[] {
  return setup.revs
    .filter((r) => r.list_id === listId)
    .map((rev) => ({
      rev,
      items: setup.items
        .filter((i) => i.rev_id === rev.id)
        .map((item) => ({ item, short: shortItem(item.name, rev.name), locked: lockOf(index, item.id, areaIds) })),
    }))
    .filter((r) => r.items.length > 0);
}

/** Picked to start with (besides the locked ones, which are on anyway): once set up, every item a kept wall still
 *  needs, else none. */
export function firstPicks(room: RevRoom, revs: readonly CardRev[], index: StatusIndex, areaIds: readonly string[]): string[] {
  if (room.card_at === null) return [];
  return revs.flatMap((r) =>
    r.items.filter((i) => i.locked === null && areaIds.some((a) => cellOf(index, a, i.item.id).status !== 'na')).map((i) => i.item.id),
  );
}

/** What Save sends: the walls on (in their order) and the items picked or locked (in list order). */
export function cardSave(walls: readonly CardWall[], wallsOn: ReadonlySet<string>, revs: readonly CardRev[], picked: ReadonlySet<string>) {
  return {
    areaIds: walls.filter((w) => wallsOn.has(w.area.id)).map((w) => w.area.id),
    itemIds: revs.flatMap((r) => r.items.filter((i) => i.locked !== null || picked.has(i.item.id)).map((i) => i.item.id)),
  };
}
