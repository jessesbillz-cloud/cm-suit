// Hours math (SPEC §15, Appendix A: MDR's timesheetMath with its tests, rewritten). Shared by the timesheets edge
// function (the PDF) and the browser (src/lib/timesheet.ts re-exports it for the Hours and Timesheets tools), so the
// numbers on the screen and on the PDF are the same numbers. Pure, no imports.
//
// Days are calendar days (yyyy-MM-dd) in the job's zone, as daily_reports.report_date stores them. Day arithmetic is
// done on the day itself at UTC midnight and read back in UTC, never through a local Date: MDR's priorWindow read the
// day as local midnight and wrote it back in UTC, which moved it a day in any zone east of UTC.

/** A submitted report's hours (daily_reports.hours; null = not entered, counted as 0). */
export interface HoursReport {
  project_id: string;
  report_date: string;
  hours: number | null;
}

/** My contract hours on a job (job_hours_budgets) and the job's name. */
export interface HoursBudget {
  project_id: string;
  name: string;
  contract_hours: number;
  /** Hours used before tracking started. */
  baseline_hours: number;
  /** The last day the baseline covers: only reports after it count. null = every report counts. */
  baseline_through: string | null;
}

export interface BudgetRow {
  projectId: string;
  name: string;
  contract: number;
  baseline: number;
  baselineThrough: string | null;
  used: number;
  remaining: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** Hours to one decimal, so sums of tenths never show float noise (6.1 + 0.2 = 6.3, not 6.300000000000001). */
export function roundHours(n: number): number {
  return Math.round(n * 10) / 10;
}

/** One report's hours: the number entered, or 0. */
export function hoursOf(r: Pick<HoursReport, 'hours'>): number {
  const h = Number(r.hours ?? 0);
  return Number.isFinite(h) ? h : 0;
}

export function sumHours(rs: readonly Pick<HoursReport, 'hours'>[]): number {
  return roundHours(rs.reduce((s, r) => s + hoursOf(r), 0));
}

function parseDay(day: string): Date {
  if (!DAY_RE.test(day)) throw new Error(`Not a calendar day: ${day}`);
  return new Date(`${day}T00:00:00Z`);
}

function dayOf(d: Date): string {
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** A calendar day moved by n days (no zone involved). */
export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dayOf(d);
}

/** 0 = Sunday ... 6 = Saturday, for a calendar day. */
export function weekdayOf(day: string): number {
  return parseDay(day).getUTCDay();
}

export interface MonthSpan {
  /** yyyy-MM */
  month: string;
  year: number;
  /** 1-12 */
  monthNo: number;
  first: string;
  last: string;
  days: number;
}

/** A month (yyyy-MM): its first and last day and how many days it has. */
export function monthSpan(month: string): MonthSpan {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`Not a month: ${month}`);
  const year = Number(m[1]);
  const monthNo = Number(m[2]);
  if (monthNo < 1 || monthNo > 12) throw new Error(`Not a month: ${month}`);
  const days = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  return { month, year, monthNo, first: `${month}-01`, last: `${month}-${String(days).padStart(2, '0')}`, days };
}

/** The month a day is in, or next to it (step = -1 / +1). */
export function shiftMonth(month: string, step: number): string {
  const { year, monthNo } = monthSpan(month);
  const d = new Date(Date.UTC(year, monthNo - 1 + step, 1));
  return dayOf(d).slice(0, 7);
}

/**
 * The reports to fetch before a month for the budget table: from the day after the earliest baseline_through to the
 * day before the month. `empty` = nothing to fetch. A job without a baseline_through counts all its history
 * (the 1900-01-01 sentinel).
 */
export function priorWindow(
  budgets: readonly Pick<HoursBudget, 'baseline_through'>[],
  firstDay: string,
): { priorStart: string; priorEnd: string; empty: boolean } {
  const earliest = budgets.map((b) => b.baseline_through ?? '1900-01-01').sort()[0] ?? '1900-01-01';
  const priorStart = addDays(earliest, 1);
  const priorEnd = addDays(firstDay, -1);
  return { priorStart, priorEnd, empty: priorStart > priorEnd };
}

interface BudgetInput {
  budgets: readonly HoursBudget[];
  priorReports?: readonly HoursReport[];
  monthReports?: readonly HoursReport[];
}

/**
 * One row per budget: used = baseline + hours reported after baseline_through (before the month and in it). Each job's
 * own cutoff applies to its own reports only; a report ON baseline_through is part of the baseline, not counted again.
 */
export function computeBudgets({ budgets, priorReports = [], monthReports = [] }: BudgetInput): BudgetRow[] {
  return budgets.map((b) => {
    const baseline = Number(b.baseline_hours) || 0;
    const contract = Number(b.contract_hours) || 0;
    const through = b.baseline_through;
    const counts = (r: HoursReport) => r.project_id === b.project_id && (through === null || r.report_date > through);
    const used = roundHours(baseline + sumHours(priorReports.filter(counts)) + sumHours(monthReports.filter(counts)));
    return {
      projectId: b.project_id,
      name: b.name,
      contract,
      baseline,
      baselineThrough: through,
      used,
      remaining: roundHours(contract - used),
    };
  });
}

/** A job's hours in a month, by day of the month (1-31); several reports on one day add up. */
export interface MonthProject {
  projectId: string;
  name: string;
  days: Record<number, number>;
  total: number;
}

/** The month grid: one row per job with hours in the month (jobs without any are left out), in the given order. */
export function monthGrid(
  jobs: readonly { project_id: string; name: string }[],
  reports: readonly HoursReport[],
  month: string,
): MonthProject[] {
  const { first, last } = monthSpan(month);
  return jobs
    .map((j) => {
      const days: Record<number, number> = {};
      for (const r of reports) {
        if (r.project_id !== j.project_id || r.report_date < first || r.report_date > last) continue;
        const h = hoursOf(r);
        if (h <= 0) continue;
        const d = Number(r.report_date.slice(8, 10));
        days[d] = roundHours((days[d] ?? 0) + h);
      }
      const total = roundHours(Object.values(days).reduce((s, h) => s + h, 0));
      return { projectId: j.project_id, name: j.name, days, total };
    })
    .filter((p) => p.total > 0);
}

/** Hours as printed: "532", "6.5", "-12". */
export function formatHours(n: number): string {
  const r = roundHours(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
