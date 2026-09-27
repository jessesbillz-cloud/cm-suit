// Where the bids tool is: the sub-view lives in the URL (?view=), the open row is the frame's item. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parseView, type BidsView } from './model';

export function useBidsNav(projectId: string) {
  const navigate = useNavigate();
  const search: { view?: string | undefined } = useSearch({ strict: false });
  const view = parseView(search.view);

  function setView(next: BidsView) {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'bids' }, search: { view: next } });
  }

  /** Opens a row (or the invite form) in the right column, optionally switching the sub-view too. */
  function open(itemId: string, inView: BidsView = view) {
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'bids', itemId }, search: { view: inView } });
  }

  return { view, setView, open };
}
