// Where the calendar is: the view (?view=) and the selected day (?day=) live in the URL; the open item is the frame's.
// On a desktop the selected day's list is the right column's item (DAY_ITEM, Jesse Oct 23: "it should shrink and show
// the little screen on the right"), so the calendar never scrolls to show it; a request, a line, the add form, blocked
// time and the feed link open there in its place, and Back to the day returns to it. On a phone the day stays under
// the month. A mirrored line of another module opens its module item (lib/calendarKinds). Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useIsPhone } from '../../app/frame/useIsPhone';
import { useOpenTarget } from '../../app/frame/useOpenTarget';
import type { CalendarLine } from '../../data/calendar.types';
import { lineTarget } from '../../lib/calendarKinds';
import { BLOCK_ITEM, DAY_ITEM, NEW_LINE, parseCalView, parseDay, requestItemId, SUBSCRIBE_ITEM, type CalView } from './model';

interface Where {
  view: CalView;
  /** null = today. */
  day: string | null;
}

export function useCalendarNav(projectId: string | null) {
  const navigate = useNavigate();
  const openTarget = useOpenTarget();
  const phone = useIsPhone();
  const search: { view?: string | undefined; day?: string | undefined } = useSearch({ strict: false });
  const view = parseCalView(search.view);
  const day = parseDay(search.day);
  /** What a day shows as: its list in the right column (desktop), or nothing (the phone's day sits under the month). */
  const dayItem = phone ? null : DAY_ITEM;

  function go(to: Where, itemId: string | null = null, replace = false) {
    const s = { view: to.view, ...(to.day !== null ? { day: to.day } : {}) };
    if (projectId === null) {
      if (itemId === null) void navigate({ to: '/all/calendar', search: s, replace });
      else void navigate({ to: '/all/calendar/$itemId', params: { itemId }, search: s, replace });
      return;
    }
    if (itemId === null) void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'calendar' }, search: s, replace });
    else void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'calendar', itemId }, search: s, replace });
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
    /** The day's list is beside the calendar (desktop), not under it. */
    beside: !phone,
    setView: (v: CalView) => {
      go({ view: v, day }, dayItem);
    },
    /** Prev / Next / Today (null). */
    setDay: (d: string | null) => {
      go({ view, day: d }, dayItem);
    },
    /** A day of the grid: its list in the right column (under the month on a phone). */
    selectDay: (d: string) => {
      go({ view, day: d }, dayItem);
    },
    /** The selected day's list in the right column when nothing is open there (the first load). Replaces the address. */
    showDay: () => {
      if (dayItem !== null) go({ view, day }, dayItem, true);
    },
    /** From an item opened off the day list: back to the list. */
    backToDay: () => {
      go({ view, day }, dayItem);
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
    /** Back to the given day (e.g. the day a line was just saved on): its list beside the calendar on a desktop. */
    closeTo: (d: string | null) => {
      go({ view, day: d ?? day }, dayItem);
    },
  };
}

export type CalendarNav = ReturnType<typeof useCalendarNav>;
