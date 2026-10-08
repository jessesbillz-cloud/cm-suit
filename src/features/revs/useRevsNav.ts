// Where the revs tool is: the view (?view=) and the level (?level=, the one row of level chips; none = the first level,
// "all" = every level) live in the URL; the open wall, room (or a setup form) is the frame's item. The Walls view is the
// rooms (0083, the default), the list (?view=list) or the plan (?view=plan, with a wall to center on and a wall being
// placed: ?wall=&place=), so a wall opened from the plan comes back to the same plan, and a wall opened from a room
// (?room=) back to that room. Every move keeps the level, so Back and links land where they were. On a desktop a
// wall's request or OFS IR opens beside its page, in the right column (?side=). A new request opens in Inspections,
// prefilled with the wall and its next items. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { RevItem } from '../../data/revs.types';
import { NEW_ITEM, REV_FILE_PREFIX, ROOM_ITEM_PREFIX } from '../../lib/itemIds';
import { parseView, requestSearch, type RevView } from './model';

interface RevsSearch {
  view?: string | undefined;
  level?: string | undefined;
  wall?: string | undefined;
  place?: string | undefined;
  room?: string | undefined;
}

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

/** How the Walls view shows them. */
export type WallsMode = 'rooms' | 'list' | 'plan';

export function useRevsNav(projectId: string, canManage: boolean) {
  const navigate = useNavigate();
  const search: RevsSearch = useSearch({ strict: false });
  const plan = search.view === 'plan';
  const mode: WallsMode = plan ? 'plan' : search.view === 'list' ? 'list' : 'rooms';
  const view = parseView(mode === 'rooms' ? search.view : 'walls', canManage);
  const levelPart = (level = search.level): Record<string, string> => (level ? { level } : {});
  const viewPart: Record<string, string> = plan ? { view: 'plan' } : mode === 'list' ? { view: 'list' } : view === 'walls' ? {} : { view };
  // A wall opened from the plan comes back to the plan, from the list the list, each at its level.
  const kept = (level = search.level): Record<string, string> => ({ ...viewPart, ...levelPart(level) });
  const params = { projectId, tool: 'revs' };
  const item = (itemId: string, s: Record<string, string>) => {
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId }, search: s });
  };

  return {
    view,
    mode,
    /** The Walls view as the plan. */
    plan,
    /** The level in the URL, as typed there (levels.ts reads it). */
    level: search.level,
    planAt: { level: search.level, wall: search.wall, place: search.place } satisfies PlanAt,
    /** The room this wall was opened from, if any. */
    fromRoom: search.room,
    setView: (v: RevView) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: { ...(v === 'walls' ? {} : { view: v }), ...levelPart() } });
    },
    setMode: (m: WallsMode) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: { ...(m === 'rooms' ? {} : { view: m }), ...levelPart() } });
    },
    /** Another level, in the same view; the browser's Back leaves Revs rather than stepping through levels. */
    setLevel: (level: string) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: { ...viewPart, level }, replace: true });
    },
    /** The plan at a level, centered on a wall or placing one; `replace` keeps the browser's Back where it was. */
    showPlan: (at: PlanAt, replace = false) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: planSearch({ ...at, level: at.level ?? search.level }), replace });
    },
    /** A wall (or a setup form) in the right column; the view stays. */
    open: (itemId: string) => {
      item(itemId, kept());
    },
    /** A room's own page. */
    openRoom: (roomId: string) => {
      item(`${ROOM_ITEM_PREFIX}${roomId}`, levelPart());
    },
    /** A wall from its room's page: its Back comes to the room. */
    openFromRoom: (areaId: string, roomId: string) => {
      item(areaId, { room: roomId, ...levelPart() });
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
    /** A new request in Inspections for these walls and items. */
    request: (areaIds: readonly string[], items: readonly RevItem[]) => {
      void navigate({
        to: '/p/$projectId/$tool/$itemId',
        params: { projectId, tool: 'inspections', itemId: NEW_ITEM },
        search: requestSearch(areaIds, items),
      });
    },
  };
}
