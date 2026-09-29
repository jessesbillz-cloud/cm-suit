// Where the Hours tool is: the view (?view=weeks|months; days by default) and the open item (a day, or the contract
// hours form) in the frame's right column. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { HoursView } from './model';

function viewOf(v: string | undefined): HoursView {
  return v === 'weeks' || v === 'months' ? v : 'days';
}

export function useHoursNav(projectId: string) {
  const navigate = useNavigate();
  const search: { view?: string | undefined } = useSearch({ strict: false });
  const view = viewOf(search.view);
  const keep = view === 'days' ? {} : { view };

  return {
    view,
    setView: (next: HoursView) => {
      void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'hours' }, search: next === 'days' ? {} : { view: next } });
    },
    /** A day (report id) or the contract form, in the right column; full screen on the phone. */
    open: (itemId: string) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'hours', itemId }, search: keep });
    },
    close: () => {
      void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'hours' }, search: keep });
    },
  };
}
