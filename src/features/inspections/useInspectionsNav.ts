// Where the inspections tool is: the view (?view=), the day (?day=: the Day view's day, the month's open day) and the
// month shown (?at=, lib/monthGrid) live in the URL, so Back closes an open day; the open request is the frame's item.
// Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parseView, type IrView } from './model';

interface IrSearch {
  view?: string | undefined;
  day?: string | undefined;
  at?: string | undefined;
}

/** The day being looked at (the job's calendar; the month's open day), or today: what a new request starts on. */
export function useSelectedDay(today: string): string {
  const search: IrSearch = useSearch({ strict: false });
  return search.day ?? today;
}

export function useInspectionsNav(projectId: string, allowed: readonly IrView[], today: string) {
  const navigate = useNavigate();
  const search: IrSearch = useSearch({ strict: false });
  const view = parseView(search.view, allowed);
  const day = search.day ?? today;

  /** undefined keeps what the URL has; null drops it. */
  function where(next: { view?: IrView; day?: string | null; at?: string | null }) {
    const d = next.day === undefined ? search.day : (next.day ?? undefined);
    const a = next.at === undefined ? search.at : (next.at ?? undefined);
    return { view: next.view ?? view, ...(d !== undefined ? { day: d } : {}), ...(a !== undefined ? { at: a } : {}) };
  }

  function go(next: { view?: IrView; day?: string | null; at?: string | null }) {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'inspections' }, search: where(next) });
  }

  /** Opens a request (or a form) in the right column; the view, the day and the month stay. */
  function open(itemId: string) {
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'inspections', itemId }, search: where({}) });
  }

  return {
    view,
    /** The Day view's day and the log's anchor: the URL's, or today. */
    day,
    /** The month (lib/monthGrid): the day it is around and the open day, as in the URL. */
    at: search.at ?? null,
    openDay: search.day ?? null,
    setView: (v: IrView) => {
      go({ view: v });
    },
    setDay: (d: string) => {
      go({ day: d, at: null });
    },
    /** The month's Prev / Next / Today / a tapped day (lib/monthGrid placeSearch). */
    moveTo: (place: { at?: string; day?: string }) => {
      go({ at: place.at ?? null, day: place.day ?? null });
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
