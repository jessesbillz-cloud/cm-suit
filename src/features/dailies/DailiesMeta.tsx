// The page header's one short line for Dailies: today's report number and due time, or "Submitted today"; for someone
// who only reads the team's reports, how many there are.
import { useDailySetup, useMyDailies, useNextDailyNumber, useTeamDailies } from '../../data/dailies.queries';
import { parseDailySettings } from '../../lib/dailies';
import { formatDay, todayInZone } from '../../lib/dates';
import { clockLabel } from '../inspections/time';
import { todayMeta } from './model';

export function WriterMeta({ projectId, tz }: { projectId: string; tz: string }) {
  const today = todayInZone(tz);
  const mine = useMyDailies(projectId, true);
  const next = useNextDailyNumber(projectId, true);
  const setup = useDailySetup(projectId);
  if (!mine.data || setup.isPending) return null;
  const todays = mine.data.find((r) => r.report_date === today) ?? null;
  const settings = parseDailySettings(setup.data?.settings);
  // ISO weekday 1 (Monday) .. 7 (Sunday); the setup counts 0 = Sunday.
  const weekday = Number(formatDay(today, 'i')) % 7;
  const due = todays !== null || settings.schedule_days.includes(weekday) ? clockLabel(settings.submit_by) : null;
  return <span data-testid="dailies-meta">{todayMeta({ todays, next: next.data, due })}</span>;
}

export function ReaderMeta({ projectId }: { projectId: string }) {
  const team = useTeamDailies(projectId, true);
  if (!team.data) return null;
  const n = team.data.length;
  return <span data-testid="dailies-meta">{n === 1 ? '1 report' : `${String(n)} reports`}</span>;
}
