// A few weeks of the mock user's submitted VIS dailies on the sample inspection job, with hours, so the Hours and
// Timesheets tools have something to show in e2e and the preview. Always before today (today's report is the one the
// tests write) and numbered below anything the tests choose. Synthetic by construction (CLAUDE.md rule 8).
import { addDays, weekdayOf } from '../../lib/timesheet';
import type { DailyReportRow } from '../dailies.types';
import { FORM_ORG } from './formJobs';

const JOB = 'job-v';
const FORM = 'vis_daily';
/** Hours per seeded day, newest first: 56 in all. */
const HOURS = [8, 6, 8, 8, 4, 8, 6, 8] as const;

/** The last weekdays before `today`, one per entry in HOURS, oldest numbered 1. */
export function hoursSeedReports(authorId: string, today: string): DailyReportRow[] {
  const days: string[] = [];
  for (let d = addDays(today, -1); days.length < HOURS.length; d = addDays(d, -1)) {
    const w = weekdayOf(d);
    if (w !== 0 && w !== 6) days.push(d);
  }
  return days.map((day, i) => {
    const number = HOURS.length - i;
    return {
      id: `mock-daily-${JOB}-seed-${String(number)}`,
      project_id: JOB,
      author_id: authorId,
      report_type: FORM,
      report_date: day,
      status: 'submitted',
      number,
      header: {
        project_name: 'Sample School Wing',
        project_number: 'S-400',
        author_name: 'Sample User',
        author_company: FORM_ORG.name,
        label: 'Daily Report',
        timezone: 'America/Los_Angeles',
      },
      content: {},
      version: 2,
      signed_at: `${day}T23:30:00Z`,
      signed_version: 2,
      submitted_at: `${day}T23:30:00Z`,
      pdf_file_id: null,
      filename: `DR_${String(number)}_Sample_School_Wing_${day}.pdf`,
      hours: HOURS[i] ?? 8,
      form: null,
    };
  });
}

/** The next number on the seeded form after the seeds. */
export const HOURS_SEED_NEXT = { [`${JOB}:${FORM}`]: HOURS.length + 1 } as const;
