// Where the calendar is: the view (?view=), the month or week shown (?at=) and the open day (?day=) live in the URL
// (lib/monthGrid), so Back closes a day; the open item is the frame's.
// A request opens in the calendar's right column (the inspections RequestPane), as does a manual line, blocked time
// and the feed link; a mirrored line of another module opens its module item (lib/calendarKinds). Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useOpenTarget } from '../../app/frame/useOpenTarget';
import type { CalendarLine } from '../../data/calendar.types';
import { lineTarget } from '../../lib/calendarKinds';
import { BLOCK_ITEM, NEW_LINE, parseCalView, parseDay, requestItemId, SUBSCRIBE_ITEM, type CalView } from './model';

interface Where {
  view: CalView;
  /** A day of the month (or week) shown; null = the open day's, else today's (lib/monthGrid). */
  at: string | null;
  /** The open day; null = none. */
  day: string | null;
}

export function useCalendarNav(projectId: string | null) {
  const navigate = useNavigate();
  const openTarget = useOpenTarget();
  const search: { view?: string | undefined; at?: string | undefined; day?: string | undefined } = useSearch({ strict: false });
  const view = parseCalView(search.view);
  const at = parseDay(search.at);
  const day = parseDay(search.day);
  const here: Where = { view, at, day };

  function go(to: Where, itemId: string | null = null) {
    const s = { view: to.view, ...(to.at !== null ? { at: to.at } : {}), ...(to.day !== null ? { day: to.day } : {}) };
    if (projectId === null) {
      if (itemId === null) void navigate({ to: '/all/calendar', search: s });
      else void navigate({ to: '/all/calendar/$itemId', params: { itemId }, search: s });
      return;
    }
    if (itemId === null) void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'calendar' }, search: s });
    else void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'calendar', itemId }, search: s });
  }

  function openLine(line: CalendarLine) {
    const target = lineTarget(line);
    if (target === null) return;
    if (target.tool === 'calendar') {
      go(here, line.id);
      return;
    }
    openTarget(line.project_id, target);
  }

  return {
    view,
    at,
    day,
    setView: (v: CalView) => {
      go({ ...here, view: v });
    },
    /** Prev / Next / Today / a tapped day: where the calendar is (lib/monthGrid placeSearch). */
    moveTo: (place: { at?: string; day?: string }) => {
      go({ view, at: place.at ?? null, day: place.day ?? null });
    },
    /** The add form in the right column, prefilled with this day. */
    add: (d: string) => {
      go({ ...here, day: d }, NEW_LINE);
    },
    /** Blocked time for the open day, in the right column. */
    block: () => {
      go(here, BLOCK_ITEM);
    },
    /** My calendar feed link, in the right column. */
    subscribe: () => {
      go(here, SUBSCRIBE_ITEM);
    },
    /** A request with its steps, in the right column; the calendar stays. */
    openRequest: (requestProjectId: string, requestId: string) => {
      go(here, requestItemId(requestProjectId, requestId));
    },
    openLine,
    /** Closes the right column and opens the given day (e.g. the day a line was just saved on: its month shows). */
    closeTo: (d: string | null) => {
      go(d === null ? here : { view, at: null, day: d });
    },
  };
}

export type CalendarNav = ReturnType<typeof useCalendarNav>;
