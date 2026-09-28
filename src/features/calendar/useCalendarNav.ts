// Where the calendar is: the view (?view=) and the day it's on (?day=) live in the URL; the open line is the frame's
// item. A manual line opens in the calendar's right column; a mirrored line opens its module item (lib/calendarKinds).
// Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { CalendarLine } from '../../data/calendar.types';
import { lineTarget } from '../../lib/calendarKinds';
import { NEW_LINE, parseCalView, parseDay, type CalView } from './model';

interface Where {
  view: CalView;
  /** null = today. */
  day: string | null;
}

export function useCalendarNav(projectId: string | null) {
  const navigate = useNavigate();
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
    const params = { projectId: line.project_id, tool: target.tool };
    if (target.itemId === null) void navigate({ to: '/p/$projectId/$tool', params });
    else void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId: target.itemId } });
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
    /** A month cell's date: that day in the day view. */
    showDay: (d: string) => {
      go({ view: 'day', day: d });
    },
    /** The add form in the right column, prefilled with this day. */
    add: (d: string) => {
      go({ view, day: d }, NEW_LINE);
    },
    openLine,
    /** Closes the right column and shows the given day (e.g. the day a line was just saved on). */
    closeTo: (d: string | null) => {
      go({ view, day: d ?? day });
    },
  };
}

export type CalendarNav = ReturnType<typeof useCalendarNav>;
