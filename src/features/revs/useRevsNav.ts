// Where the revs tool is: the view (?view=) lives in the URL; the open wall (or a setup form) is the frame's item. The
// Walls view is a list or the plan (?view=plan, with the level shown, a wall to center on and a wall being placed:
// ?level=&wall=&place=), so a wall opened from the plan comes back to the same plan. A request opens in Inspections:
// the one it links to, or a new one prefilled with the wall and its next items. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { RevItem } from '../../data/revs.types';
import { NEW_ITEM } from '../../lib/itemIds';
import { parseView, requestSearch, type RevView } from './model';

interface RevsSearch {
  view?: string | undefined;
  level?: string | undefined;
  wall?: string | undefined;
  place?: string | undefined;
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

export function useRevsNav(projectId: string, canManage: boolean) {
  const navigate = useNavigate();
  const search: RevsSearch = useSearch({ strict: false });
  const plan = search.view === 'plan';
  const view = parseView(plan ? 'walls' : search.view, canManage);
  // A wall opened from the plan keeps the plan's level to come back to.
  const kept: Record<string, string> = plan ? planSearch({ level: search.level }) : view === 'walls' ? {} : { view };
  const params = { projectId, tool: 'revs' };

  return {
    view,
    /** The Walls view as the plan (else the list). */
    plan,
    planAt: { level: search.level, wall: search.wall, place: search.place } satisfies PlanAt,
    setView: (v: RevView) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: v === 'walls' ? {} : { view: v } });
    },
    /** The plan at a level, centered on a wall or placing one; `replace` keeps the browser's Back where it was. */
    showPlan: (at: PlanAt, replace = false) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: planSearch(at), replace });
    },
    /** A wall (or a setup form) in the right column; the view stays. */
    open: (itemId: string) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId }, search: kept });
    },
    close: () => {
      void navigate({ to: '/p/$projectId/$tool', params, search: kept });
    },
    /** The request that decided an item, in Inspections. */
    openRequest: (requestId: string) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'inspections', itemId: requestId } });
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
