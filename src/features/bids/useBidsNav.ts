// Where the bids tool is: the sub-view (?view=) and the leveling package (?pkg=) live in the URL, the open row is
// the frame's item. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { INVITE_ITEM, parseView, type BidsView } from './model';

export function useBidsNav(projectId: string) {
  const navigate = useNavigate();
  const search: { view?: string | undefined; pkg?: string | undefined } = useSearch({ strict: false });
  const view = parseView(search.view);
  const pkg = search.pkg ?? null;

  function setView(next: BidsView) {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'bids' }, search: { view: next } });
  }

  /** Leveling: the package whose grid is showing. */
  function setPkg(packageId: string) {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'bids' }, search: { view: 'leveling', pkg: packageId } });
  }

  /** Opens a row (or the invite form) in the right column, optionally switching the sub-view too. */
  function open(itemId: string, inView: BidsView = view) {
    void navigate({
      to: '/p/$projectId/$tool/$itemId',
      params: { projectId, tool: 'bids', itemId },
      search: pkg !== null && inView === 'leveling' ? { view: inView, pkg } : { view: inView },
    });
  }

  /** The invite form, with a package already picked when it is opened from that package (coverage row). */
  function invite(packageId?: string) {
    void navigate({
      to: '/p/$projectId/$tool/$itemId',
      params: { projectId, tool: 'bids', itemId: INVITE_ITEM },
      search: packageId !== undefined ? { view, pkg: packageId } : { view },
    });
  }

  return { view, pkg, setView, setPkg, open, invite };
}
