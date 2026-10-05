// my_daily_today in the e2e mock (0045): one row per sample job (Dailies on, not lost or archived) where the mock user
// has a daily setup, read from the mock dailies (the setup chosen last, today's report in the job's zone, the next
// number), the way the database answers it. Nobody without dailies.write gets any. Synthetic by construction.
import { parseDailySettings } from '../../lib/dailies';
import { todayInZone } from '../../lib/dates';
import type { DailyTodayRow } from '../dailyToday.types';
import { capability } from './bids';
import * as dailies from './dailies';
import { mockUser } from './index';
import { projects } from './jobs';

const ENDED = ['lost', 'archived'];

async function rowFor(job: { project_id: string; name: string; timezone: string }): Promise<DailyTodayRow | null> {
  const [setup] = await dailies.setups(job.project_id);
  if (!setup) return null;
  const settings = parseDailySettings(setup.settings);
  const today = todayInZone(job.timezone);
  const me = mockUser().id;
  const report = (await dailies.myReports(job.project_id)).find(
    (r) => r.author_id === me && r.report_type === setup.report_type && r.report_date === today,
  );
  const number = report?.number ?? null;
  return {
    project_id: job.project_id,
    project_name: job.name,
    report_type: setup.report_type,
    label: settings.label,
    schedule_days: [...new Set(settings.schedule_days)].sort((a, b) => a - b),
    today,
    scheduled_today: settings.schedule_days.includes(new Date(`${today}T12:00:00Z`).getUTCDay()),
    report_id: report?.id ?? null,
    status: report ? (report.status === 'submitted' ? 'submitted' : 'draft') : 'none',
    number,
    next_number: number === null ? await dailies.peek(job.project_id, setup.report_type) : null,
    report_version: report?.version ?? null,
  };
}

export async function dailyToday(): Promise<DailyTodayRow[]> {
  if (!(await capability('dailies.write'))) return [];
  const jobs = (await projects()).filter((p) => p.modules.includes('dailies') && !ENDED.includes(p.stage));
  const rows = await Promise.all(jobs.map(rowFor));
  return rows
    .filter((r): r is DailyTodayRow => r !== null)
    .sort((a, b) => a.project_name.localeCompare(b.project_name) || a.project_id.localeCompare(b.project_id));
}
