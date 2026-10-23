// Where the revs tool is: the view (?view=: none = the rooms, plan, checklist, or setup for a manager) and the level
// (?level=, the one row of level chips; none = the first level, "all" = every level) live in the URL; the open wall,
// room, the request being built (0113) or a setup form is the frame's item. The plan has a wall to center on and a
// wall being placed (?wall=&place=), so a wall opened from the plan comes back to the same plan, and a wall opened from
// a room (?room=) back to that room. A wall opened from an item's chip on its room's row opens at that item (?item=).
// Every move keeps the level, so Back and links land where they were. On a desktop a wall's request or OFS IR opens
// beside its page, in the right column (?side=). A room's card is set up on the room's page (?view=card). A wall added
// on the spot is its own screen (from a room: ?room=). Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { BASKET_ITEM, FIELD_WALL_ITEM, REV_FILE_PREFIX, ROOM_ITEM_PREFIX } from '../../lib/itemIds';
import { parseView, type RevView } from './model';

interface RevsSearch {
  view?: string | undefined;
  level?: string | undefined;
  wall?: string | undefined;
  place?: string | undefined;
  room?: string | undefined;
}

/** The item a wall's page opens at (?item=, a chip on its room's row). */
const atItem = (itemId: string | undefined): Record<string, string> => (itemId ? { item: itemId } : {});

/** The plan's place in the URL. */
interface PlanAt {
  level?: string | undefined;
  /** The wall to center on. */
  wall?: string | undefined;
  /** The wall being placed on the plan (managers). */
  place?: string | undefined;
}

function planSearch(at: PlanAt): Record<string, string> {
  return {
    view: 'plan',
    ...(at.level ? { level: at.level } : {}),
    ...(at.wall ? { wall: at.wall } : {}),
    ...(at.place ? { place: at.place } : {}),
  };
}

export function useRevsNav(projectId: string, canManage: boolean) {
  const navigate = useNavigate();
  const search: RevsSearch = useSearch({ strict: false });
  const plan = search.view === 'plan';
  const view = parseView(plan ? undefined : search.view, canManage);
  const levelPart = (level = search.level): Record<string, string> => (level ? { level } : {});
  const viewPart: Record<string, string> = plan ? { view: 'plan' } : view === 'walls' ? {} : { view };
  // A wall opened from the plan comes back to the plan, from the rooms the rooms, each at its level.
  const kept = (level = search.level): Record<string, string> => ({ ...viewPart, ...levelPart(level) });
  const params = { projectId, tool: 'revs' };
  const item = (itemId: string, s: Record<string, string>, replace = false) => {
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId }, search: s, replace });
  };

  return {
    view,
    /** The level's plan sheet with its walls. */
    plan,
    /** The level in the URL, as typed there (levels.ts reads it). */
    level: search.level,
    planAt: { level: search.level, wall: search.wall, place: search.place } satisfies PlanAt,
    /** The room this wall was opened from, if any. */
    fromRoom: search.room,
    setView: (v: RevView) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: { ...(v === 'walls' ? {} : { view: v }), ...levelPart() } });
    },
    /** Another level, in the same view; the browser's Back leaves Revs rather than stepping through levels. */
    setLevel: (level: string) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: { ...viewPart, level }, replace: true });
    },
    /** The plan at a level, centered on a wall or placing one; `replace` keeps the browser's Back where it was. */
    showPlan: (at: PlanAt, replace = false) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: planSearch({ ...at, level: at.level ?? search.level }), replace });
    },
    /** A wall (or a setup form) in the right column, a wall at one of its items; the view stays. */
    open: (itemId: string, focusItem?: string) => {
      item(itemId, { ...kept(), ...atItem(focusItem) });
    },
    /** A room's own page; `replace`: in place of the screen it leaves (its card set up). */
    openRoom: (roomId: string, replace = false) => {
      item(`${ROOM_ITEM_PREFIX}${roomId}`, levelPart(), replace);
    },
    /** A room's card being set up (a manager): its own screen on the room's page (?view=card). */
    openCard: (roomId: string) => {
      item(`${ROOM_ITEM_PREFIX}${roomId}`, { ...levelPart(), view: 'card' });
    },
    /** A wall from its room's page (at one of its items): its Back comes to the room. `replace`: in place of this screen. */
    openFromRoom: (areaId: string, roomId: string, focusItem?: string, replace = false) => {
      item(areaId, { room: roomId, ...levelPart(), ...atItem(focusItem) }, replace);
    },
    /** Back to Revs: the view and level it came from, or else the level of the wall or room it leaves. */
    close: (level?: string) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: kept(search.level ?? level) });
    },
    /** The request that decided an item, in Inspections. */
    openRequest: (requestId: string) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'inspections', itemId: requestId } });
    },
    /** Beside this wall's page (desktop): its request, or a sign-off's OFS IR, in the right column. */
    openBeside: (areaId: string, side: { requestId: string } | { fileId: string }) => {
      const value = 'requestId' in side ? `inspections:${side.requestId}` : `revs:${REV_FILE_PREFIX}${side.fileId}`;
      item(areaId, { ...(search.room ? { room: search.room } : {}), ...kept(), side: value });
    },
    /** The request being built (0113): its review. */
    review: () => {
      item(BASKET_ITEM, levelPart());
    },
    /** A wall added on the spot (0113), from a room or from the cards. */
    addWall: (roomId?: string) => {
      item(FIELD_WALL_ITEM, { ...levelPart(), ...(roomId ? { room: roomId } : {}) });
    },
  };
}
