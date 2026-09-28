// Where the dailies tool is: the list (?view=team for everyone's submitted reports) and the open item (a report, or
// setup) in the frame's right column. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';

export type DailiesView = 'mine' | 'team';

export function useDailiesNav(projectId: string) {
  const navigate = useNavigate();
  const search: { view?: string | undefined } = useSearch({ strict: false });
  const view: DailiesView = search.view === 'team' ? 'team' : 'mine';

  function setView(next: DailiesView) {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'dailies' }, search: next === 'team' ? { view: next } : {} });
  }

  /** Opens a report (or the setup) in the right column; full screen on the phone. */
  function open(itemId: string) {
    void navigate({
      to: '/p/$projectId/$tool/$itemId',
      params: { projectId, tool: 'dailies', itemId },
      search: view === 'team' ? { view } : {},
    });
  }

  return { view, setView, open };
}
