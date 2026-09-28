// Where the inspections tool is: the view (?view=) and the day (?day=) live in the URL; the open request is the
// frame's item. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parseView, type IrView } from './model';

interface IrSearch {
  view?: string | undefined;
  day?: string | undefined;
}

/** The day being looked at (the job's calendar), or today. */
export function useSelectedDay(today: string): string {
  const search: IrSearch = useSearch({ strict: false });
  return search.day ?? today;
}

export function useInspectionsNav(projectId: string, allowed: readonly IrView[], today: string) {
  const navigate = useNavigate();
  const search: IrSearch = useSearch({ strict: false });
  const view = parseView(search.view, allowed);
  const day = search.day ?? today;

  function go(next: { view?: IrView; day?: string }) {
    void navigate({
      to: '/p/$projectId/$tool',
      params: { projectId, tool: 'inspections' },
      search: { view: next.view ?? view, day: next.day ?? day },
    });
  }

  /** Opens a request (or a form) in the right column; the view and day stay. */
  function open(itemId: string) {
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'inspections', itemId }, search: { view, day } });
  }

  return {
    view,
    day,
    setView: (v: IrView) => {
      go({ view: v });
    },
    setDay: (d: string) => {
      go({ day: d });
    },
    /** A day header in the week opens that day (the inspector's queue when there is one). */
    showDay: (d: string, v: IrView) => {
      go({ view: v, day: d });
    },
    open,
  };
}

/** Closes the right column back to the tool (after a form is done), keeping the view and day. */
export function useCloseItem(projectId: string) {
  const navigate = useNavigate();
  return () => {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'inspections' }, search: true });
  };
}

/** Opens a request from inside the right column (the receipt's "Track it"). */
export function useOpenRequest(projectId: string) {
  const navigate = useNavigate();
  return (itemId: string) => {
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'inspections', itemId }, search: true });
  };
}
