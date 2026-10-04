// my_daily_form and daily_day_facts (0070) in the e2e mock, read from the other mocks the way the database reads its
// tables: that day's sign-ins at the job's safety meetings by company and trade (a person once), its closed meetings,
// deliveries and inspection requests (not withdrawn). Safety only for a mock user who reads it, like its RLS.
import type { DayFacts } from '../dailies.types';
import * as mockDeliveries from './deliveries';
import { gcJobForm } from './gcJobs';
import * as mockInspections from './inspections';
import * as mockSafety from './safety';
import { delay } from './store';

export async function myDailyForm(projectId: string): Promise<string | null> {
  await delay();
  return gcJobForm(projectId);
}

async function safetyFacts(projectId: string, day: string): Promise<Pick<DayFacts, 'signins' | 'meetings'>> {
  if (!(await mockSafety.capability('safety.read'))) return { signins: [], meetings: [] };
  const held = (await mockSafety.meetings(projectId)).filter((m) => m.held_on === day);
  const groups = new Map<string, { company: string; trade: string; names: Set<string> }>();
  for (const m of held) {
    for (const line of await mockSafety.roster(m.id, false)) {
      const key = `${line.company.trim().toLowerCase()}|${line.trade.trim().toLowerCase()}`;
      const g = groups.get(key) ?? { company: line.company.trim(), trade: line.trade.trim(), names: new Set<string>() };
      g.names.add(line.name.trim().toLowerCase());
      groups.set(key, g);
    }
  }
  return {
    signins: [...groups.values()]
      .map((g) => ({ company: g.company, trade: g.trade, count: g.names.size }))
      .sort((a, b) => a.company.localeCompare(b.company) || a.trade.localeCompare(b.trade)),
    meetings: held
      .filter((m) => m.status === 'closed')
      .sort((a, b) => a.number - b.number)
      .map((m) => ({ id: m.id, kind: m.kind, number: m.number, title: m.title, signed: m.signed })),
  };
}

export async function dayFacts(projectId: string, day: string): Promise<DayFacts> {
  const safety = await safetyFacts(projectId, day);
  const deliveries = await mockDeliveries.list(projectId, day, day);
  const inspections = await mockInspections.list(projectId, (r) => r.request_date === day && r.status !== 'withdrawn');
  return {
    ...safety,
    deliveries: deliveries.map((d) => ({
      id: d.id, number: d.number, starts_at: d.starts_at, company: d.company, description: d.description, standby: d.standby,
    })),
    inspections: inspections
      .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.number - b.number)
      .map((r) => ({
        id: r.id, number: r.number, kind: r.kind, special: r.ir_special_kinds?.name ?? null, items: r.items,
        start_time: r.start_time === null ? null : r.start_time.slice(0, 5), status: r.status, result: r.result, helper_id: r.helper_id,
      })),
  };
}
