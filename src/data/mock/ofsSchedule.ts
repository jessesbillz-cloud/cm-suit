// ofs_schedule for the e2e mock (0108): the OFS requests sent to OFS on the jobs where the signed-in mock user decides
// them (or one job), the days asked, and the Asked ones with no time (Needs a time) whatever their day.
import { addDays, format, parseISO } from 'date-fns';
import type { ScheduleRow } from '../inspections.schedule';
import type { IrRowRaw } from '../inspections.types';
import { MOCK_PEOPLE } from './fixtures';
import { everyRequest } from './inspections';
import { holds } from './irRules';
import { projects } from './jobs';
import { mockUser } from './index';
import { read as readRevs } from './revs';
import { delay } from './store';

/** ir_ofs_sched_state. */
function stateOf(r: IrRowRaw): ScheduleRow['state'] {
  if (r.result !== null || r.status === 'complete') return 'done';
  if (r.status === 'withdrawn') return 'withdrawn';
  if (r.status === 'postponed') return 'postponed';
  if (r.ofs_sched === 'proposed' && r.status === 'pending') return 'proposed';
  return r.status === 'confirmed' ? 'confirmed' : 'asked';
}

/** ir_ofs_place: "2 walls · " and the first line of what the request lists. */
function placeOf(r: IrRowRaw): string {
  const walls = new Set(readRevs().cells.filter((c) => c.request_id === r.id).map((c) => c.area_id)).size;
  const lead = walls === 0 ? '' : walls === 1 ? '1 wall · ' : `${String(walls)} walls · `;
  return `${lead}${r.items.trim().split('\n')[0] ?? ''}`.slice(0, 200);
}

export async function schedule(projectId: string | null, from: string, to: string): Promise<ScheduleRow[]> {
  await delay();
  const oldest = format(addDays(parseISO(from), -30), 'yyyy-MM-dd');
  const jobs = (await projects()).filter((p) => p.modules.includes('inspections') && (projectId === null || p.project_id === projectId));
  if (!holds(mockUser().id, 'ir.ofs_decide')) return [];
  const rows: ScheduleRow[] = [];
  for (const r of everyRequest()) {
    const job = jobs.find((j) => j.project_id === r.project_id);
    if (!job || r.deleted_at !== null || r.kind !== 'ofs' || r.ofs_sent_at === null || r.status === 'withdrawn') continue;
    const state = stateOf(r);
    const needsTime = state === 'asked' && r.start_time === null;
    const inRange = r.request_date >= from && r.request_date <= to;
    if (!inRange && !(needsTime && r.request_date >= oldest)) continue;
    rows.push({
      id: r.id, project_id: r.project_id, project_name: job.name, timezone: job.timezone, number: r.number, ofs_number: r.ofs_number,
      version: r.version, request_date: r.request_date, start_time: r.start_time, duration_kind: r.duration_kind,
      duration_min: r.duration_min, state, needs_time: needsTime, place: placeOf(r),
      requester: MOCK_PEOPLE.find((p) => p.user_id === r.requested_by)?.full_name ?? r.requester_name ?? r.company,
      company: r.company, sched_note: r.ofs_sched_note, sched_at: r.ofs_sched_at,
    });
  }
  return rows.sort(
    (a, b) => a.request_date.localeCompare(b.request_date) || (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.number - b.number,
  );
}
