// Where the Schedule tool is: the view (?view=activities|updates) and the look-ahead's window (?range=2m) live in the
// URL; the open activity, update or draft is the frame's item (a draft's review fills the main area on a desktop).
// Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parseRange, parseView, type Range, type ScheduleView } from './model';

interface ScheduleSearch {
  view?: string | undefined;
  range?: string | undefined;
}

export function useScheduleNav(projectId: string) {
  const navigate = useNavigate();
  const search: ScheduleSearch = useSearch({ strict: false });
  const view = parseView(search.view);
  const range = parseRange(search.range);
  const kept = { ...(view === 'lookahead' ? {} : { view }), ...(range === '3w' ? {} : { range }) };
  const params = { projectId, tool: 'schedule' };

  return {
    view,
    range,
    setView: (v: ScheduleView) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: { ...(v === 'lookahead' ? {} : { view: v }), ...(range === '3w' ? {} : { range }) } });
    },
    setRange: (r: Range) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: { ...(view === 'lookahead' ? {} : { view }), ...(r === '3w' ? {} : { range: r }) }, replace: true });
    },
    /** An item beside the list (a draft fills the main area); the view stays. `replace` keeps Back where it was. */
    open: (itemId: string, replace = false) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId }, search: kept, replace });
    },
    /** Back to the list, on a view (the draft's page goes back to Updates, a publish to the look-ahead). */
    close: (to?: ScheduleView) => {
      const v = to ?? view;
      void navigate({ to: '/p/$projectId/$tool', params, search: { ...(v === 'lookahead' ? {} : { view: v }), ...(range === '3w' ? {} : { range }) } });
    },
  };
}
