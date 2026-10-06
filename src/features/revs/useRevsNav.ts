// Where the revs tool is: the view (?view=) lives in the URL; the open wall, room (or a setup form) is the frame's item.
// The Walls view is the rooms (0083, the default), the list (?view=list) or the plan (?view=plan, with the level
// shown, a wall to center on and a wall being placed: ?level=&wall=&place=), so a wall opened from the plan comes back
// to the same plan, and a wall opened from a room (?room=) back to that room. On a desktop a wall's request or OFS IR
// opens beside its page, in the right column (?side=). A new request opens in Inspections, prefilled with the wall and
// its next items. Router only.
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
  // A wall opened from the plan keeps the plan's level to come back to, from the list the list.
  const kept: Record<string, string> = plan
    ? planSearch({ level: search.level })
    : mode === 'list'
      ? { view: 'list' }
      : view === 'walls'
        ? {}
        : { view };
  const params = { projectId, tool: 'revs' };
  const item = (itemId: string, s: Record<string, string>) => {
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId }, search: s });
  };

  return {
    view,
    mode,
    /** The Walls view as the plan. */
    plan,
    planAt: { level: search.level, wall: search.wall, place: search.place } satisfies PlanAt,
    /** The room this wall was opened from, if any. */
    fromRoom: search.room,
    setView: (v: RevView) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: v === 'walls' ? {} : { view: v } });
    },
    setMode: (m: WallsMode) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: m === 'rooms' ? {} : { view: m } });
    },
    /** The plan at a level, centered on a wall or placing one; `replace` keeps the browser's Back where it was. */
    showPlan: (at: PlanAt, replace = false) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: planSearch(at), replace });
    },
    /** A wall (or a setup form) in the right column; the view stays. */
    open: (itemId: string) => {
      item(itemId, kept);
    },
    /** A room's own page. */
    openRoom: (roomId: string) => {
      item(`${ROOM_ITEM_PREFIX}${roomId}`, {});
    },
    /** A wall from its room's page: its Back comes to the room. */
    openFromRoom: (areaId: string, roomId: string) => {
      item(areaId, { room: roomId });
    },
    close: () => {
      void navigate({ to: '/p/$projectId/$tool', params, search: kept });
    },
    /** The request that decided an item, in Inspections. */
    openRequest: (requestId: string) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'inspections', itemId: requestId } });
    },
    /** Beside this wall's page (desktop): its request, or a sign-off's OFS IR, in the right column. */
    openBeside: (areaId: string, side: { requestId: string } | { fileId: string }) => {
      const value = 'requestId' in side ? `inspections:${side.requestId}` : `revs:${REV_FILE_PREFIX}${side.fileId}`;
      item(areaId, { ...(search.room ? { room: search.room } : {}), ...kept, side: value });
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
