// Where the calendar is: the view (?view=) and the selected day (?day=) live in the URL; the open item is the frame's.
// A request opens in the calendar's right column (the inspections RequestPane), as does a manual line, blocked time
// and the feed link; a mirrored line of another module opens its module item (lib/calendarKinds). Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useOpenTarget } from '../../app/frame/useOpenTarget';
import type { CalendarLine } from '../../data/calendar.types';
import { lineTarget } from '../../lib/calendarKinds';
import { BLOCK_ITEM, NEW_LINE, parseCalView, parseDay, requestItemId, SUBSCRIBE_ITEM, type CalView } from './model';

interface Where {
  view: CalView;
  /** null = today. */
  day: string | null;
}

export function useCalendarNav(projectId: string | null) {
  const navigate = useNavigate();
  const openTarget = useOpenTarget();
  const search: { view?: string | undefined; day?: string | undefined } = useSearch({ strict: false });
  const view = parseCalView(search.view);
  const day = parseDay(search.day);

  function go(to: Where, itemId: string | null = null) {
    const s = { view: to.view, ...(to.day !== null ? { day: to.day } : {}) };
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
      go({ view, day }, line.id);
      return;
    }
    openTarget(line.project_id, target);
  }

  return {
    view,
    day,
    setView: (v: CalView) => {
      go({ view: v, day });
    },
    /** Prev / Next / Today (null). */
    setDay: (d: string | null) => {
      go({ view, day: d });
    },
    /** A day of the grid: shown under it. */
    selectDay: (d: string) => {
      go({ view, day: d });
    },
    /** The add form in the right column, prefilled with this day. */
    add: (d: string) => {
      go({ view, day: d }, NEW_LINE);
    },
    /** Blocked time for the selected day, in the right column. */
    block: () => {
      go({ view, day }, BLOCK_ITEM);
    },
    /** My calendar feed link, in the right column. */
    subscribe: () => {
      go({ view, day }, SUBSCRIBE_ITEM);
    },
    /** A request with its steps, in the right column; the calendar stays. */
    openRequest: (requestProjectId: string, requestId: string) => {
      go({ view, day }, requestItemId(requestProjectId, requestId));
    },
    openLine,
    /** Closes the right column and shows the given day (e.g. the day a line was just saved on). */
    closeTo: (d: string | null) => {
      go({ view, day: d ?? day });
    },
  };
}

export type CalendarNav = ReturnType<typeof useCalendarNav>;
