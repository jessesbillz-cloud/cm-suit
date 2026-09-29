// Hours math (SPEC §15): the ONE implementation lives with the edge functions so the Hours and Timesheets tools and the
// timesheet PDF show the same numbers. Here: that math re-exported, and the few groupings only the screens need.
import { formatDay } from './dates';
import { addDays, roundHours, weekdayOf } from '../../supabase/functions/_shared/timesheet';

export {
  addDays,
  computeBudgets,
  formatHours,
  monthGrid,
  monthSpan,
  priorWindow,
  roundHours,
  shiftMonth,
  sumHours,
  weekdayOf,
  type BudgetRow,
  type HoursBudget,
  type HoursReport,
  type MonthProject,
} from '../../supabase/functions/_shared/timesheet';

/** The Monday of a day's week (yyyy-MM-dd). */
export function weekOf(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

interface HoursGroup {
  /** The week's Monday, or the month (yyyy-MM). */
  key: string;
  days: number;
  hours: number;
}

/** Days with hours, summed per week (Monday first) or per month; newest first. A day with no hours still counts as a day. */
export function groupHours(rows: readonly { report_date: string; hours: number | null }[], by: 'week' | 'month'): HoursGroup[] {
  const groups = new Map<string, { days: Set<string>; hours: number }>();
  for (const r of rows) {
    const key = by === 'week' ? weekOf(r.report_date) : r.report_date.slice(0, 7);
    const g = groups.get(key) ?? { days: new Set<string>(), hours: 0 };
    g.days.add(r.report_date);
    g.hours += r.hours ?? 0;
    groups.set(key, g);
  }
  return [...groups]
    .map(([key, g]) => ({ key, days: g.days.size, hours: roundHours(g.hours) }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

/** "September 2026" for a month (yyyy-MM). */
export function monthLabel(month: string): string {
  return formatDay(`${month}-01`, 'MMMM yyyy');
}

/** How far along the contract is, 0-100 (over 100 = overrun, shown full). */
export function usedPercent(used: number, contract: number): number {
  if (contract <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((used / contract) * 100)));
}

const HOURS_TEXT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** Hours on screen: "4,508", "6.5". */
export function hoursText(n: number): string {
  return HOURS_TEXT.format(roundHours(n));
}
