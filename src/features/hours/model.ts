// The Hours tool's small rules: its views, the right-column item for the contract form, the preset hours, the header
// line and a report's name on a day row.
import type { HoursBudgetRow, HoursDayRow } from '../../data/hours.types';
import { dailyHeaderSchema } from '../../lib/dailies';
import { computeBudgets, hoursText, sumHours, type BudgetRow } from '../../lib/timesheet';

export type HoursView = 'days' | 'weeks' | 'months';

export const HOURS_VIEWS: readonly { value: HoursView; label: string }[] = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
];

/** The right column's contract hours form (a report id opens that day). */
export const CONTRACT_ITEM = 'contract';

/** MDR's prompt after submit: 0 / 2 / 4 / 6 / 8, or another number. */
export const PRESET_HOURS = [0, 2, 4, 6, 8] as const;

/** A typed number of hours, or null when it is not 0-24 in tenths. */
export function parseHours(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,2}(\.\d)?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 24 ? n : null;
}

/** The job's contract row (used = baseline + my hours after the baseline's last day), or null without a budget. */
export function jobBudget(budget: HoursBudgetRow | null, days: readonly HoursDayRow[]): BudgetRow | null {
  if (budget === null) return null;
  const [row] = computeBudgets({
    budgets: [{ ...budget, name: '' }],
    priorReports: days.map((d) => ({ project_id: d.project_id, report_date: d.report_date, hours: d.hours })),
  });
  return row ?? null;
}

/** "46 h this month · 3,610 h left" */
export function hoursMeta(days: readonly HoursDayRow[], thisMonth: string, budget: BudgetRow | null): string {
  const month = sumHours(days.filter((d) => d.report_date.startsWith(thisMonth)));
  const parts = [`${hoursText(month)} h this month`];
  if (budget) parts.push(budget.remaining < 0 ? `${hoursText(-budget.remaining)} h over` : `${hoursText(budget.remaining)} h left`);
  return parts.join(' · ');
}

/** "Daily Report #12" from the report's locked header. */
export function reportName(d: Pick<HoursDayRow, 'header' | 'number'>): string {
  const h = dailyHeaderSchema.safeParse(d.header);
  const label = h.success && h.data.label !== '' ? h.data.label : 'Daily report';
  return d.number === null ? label : `${label} #${String(d.number)}`;
}
