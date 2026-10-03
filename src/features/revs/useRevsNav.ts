// Where the revs tool is: the view (?view=) lives in the URL; the open wall (or a setup form) is the frame's item. A
// request opens in Inspections: the one it links to, or a new one prefilled with the wall and its next items. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { RevItem } from '../../data/revs.types';
import { NEW_ITEM } from '../../lib/itemIds';
import { parseView, requestSearch, type RevView } from './model';

interface RevsSearch {
  view?: string | undefined;
}

export function useRevsNav(projectId: string, canManage: boolean) {
  const navigate = useNavigate();
  const search: RevsSearch = useSearch({ strict: false });
  const view = parseView(search.view, canManage);
  const kept = view === 'walls' ? {} : { view };
  const params = { projectId, tool: 'revs' };

  return {
    view,
    setView: (v: RevView) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: v === 'walls' ? {} : { view: v } });
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
