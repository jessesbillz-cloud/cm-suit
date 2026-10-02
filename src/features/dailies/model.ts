// Small rules of the dailies screens (SPEC §13.1). Pure, so they are unit-tested.
import type { DailyReportRow } from '../../data/dailies.types';
import type { StatusKey } from '../../lib/status';

/** The right column's item for the setup screen (any other item id is a report). */
export { SETUP_ITEM } from '../../lib/itemIds';

type TodayAction = 'start' | 'continue' | 'edit';

export const TODAY_LABELS: Record<TodayAction, string> = { start: 'Start', continue: 'Continue', edit: 'Edit submitted' };

/** The tool's main button: Start (nothing yet, or untouched), Continue (a draft with work in it), Edit submitted. */
export function todayAction(report: Pick<DailyReportRow, 'status' | 'version'> | null): TodayAction {
  if (report === null) return 'start';
  if (report.status === 'submitted') return 'edit';
  return report.version > 1 ? 'continue' : 'start';
}

/** Earlier days' reports that were never submitted, oldest first (the one-line banner). */
export function earlierDrafts<T extends Pick<DailyReportRow, 'status' | 'report_date'>>(reports: readonly T[], today: string): T[] {
  return reports.filter((r) => r.status === 'draft' && r.report_date < today).sort((a, b) => a.report_date.localeCompare(b.report_date));
}

/** "#12", or "will be #12" before the first signing (the database gives the number then). */
export function numberLabel(number: number | null, next: number | undefined): string {
  if (number !== null) return `#${String(number)}`;
  return next === undefined ? '' : `will be #${String(next)}`;
}

/** The chip on a report row: draft, submitted, or changed since it was signed. */
export function reportChip(r: Pick<DailyReportRow, 'status' | 'version' | 'signed_version'>): { status: StatusKey; label: string } {
  if (r.status !== 'submitted') return { status: 'pending', label: 'Draft' };
  if (r.version !== r.signed_version) return { status: 'postponed', label: 'Changed' };
  return { status: 'confirmed', label: 'Submitted' };
}

interface MetaInput {
  todays: Pick<DailyReportRow, 'status' | 'number' | 'version' | 'signed_version'> | null;
  next: number | undefined;
  /** "5:00 PM" when a report is due today (a scheduled day, or today's report exists), else null. */
  due: string | null;
}

/** The page header's one line: "Report #12 · due 5:00 PM", "Submitted today", or "Report #12 · changed". */
export function todayMeta({ todays, next, due }: MetaInput): string | null {
  const n = todays?.number ?? next;
  if (todays?.status === 'submitted') {
    return todays.version === todays.signed_version ? 'Submitted today' : `Report #${String(n)} · changed`;
  }
  const parts = [n === undefined ? null : `Report #${String(n)}`, due === null ? null : `due ${due}`].filter(
    (p): p is string => p !== null,
  );
  if (parts.length === 0) return null;
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** Schedule day toggles, Sunday first (0 = Sunday, like the setup's schedule_days). */
export const WEEK_DAYS = [
  { day: 0, short: 'S', name: 'Sunday' },
  { day: 1, short: 'M', name: 'Monday' },
  { day: 2, short: 'T', name: 'Tuesday' },
  { day: 3, short: 'W', name: 'Wednesday' },
  { day: 4, short: 'T', name: 'Thursday' },
  { day: 5, short: 'F', name: 'Friday' },
  { day: 6, short: 'S', name: 'Saturday' },
] as const;

/** Recipients typed any way (commas, spaces, new lines, semicolons) as a clean list; the setup schema checks each. */
export function parseRecipients(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase();
    if (email !== '') seen.add(email);
  }
  return [...seen];
}

export const REMINDER_OPTIONS = [
  { value: '0', label: 'None' },
  { value: '15', label: '15 min before' },
  { value: '30', label: '30 min before' },
  { value: '60', label: '1 hour before' },
  { value: '120', label: '2 hours before' },
] as const;
