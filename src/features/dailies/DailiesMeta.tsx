// The page header's one short line for Dailies: today's report number and due time, or "Submitted today"; for someone
// who only reads the team's reports, how many there are.
import { useMyDailies, useNextDailyNumber, useTeamDailies } from '../../data/dailies.queries';
import type { ProjectRow } from '../../data/types';
import { parseDailySettings, type DailySettings } from '../../lib/dailies';
import { formatDay, todayInZone } from '../../lib/dates';
import { clockLabel } from '../inspections/time';
import { todayMeta } from './model';
import { useDailyForm } from './useDailyForm';

interface WriterLineProps {
  project: ProjectRow;
  reportType: string;
  settings: DailySettings;
}

function WriterLine({ project, reportType, settings }: WriterLineProps) {
  const today = todayInZone(project.timezone);
  const mine = useMyDailies(project.id, true);
  const next = useNextDailyNumber(project.id, reportType, true);
  if (!mine.data) return null;
  const todays = mine.data.find((r) => r.report_date === today && r.report_type === reportType) ?? null;
  // ISO weekday 1 (Monday) .. 7 (Sunday); the setup counts 0 = Sunday.
  const weekday = Number(formatDay(today, 'i')) % 7;
  const due = todays !== null || settings.schedule_days.includes(weekday) ? clockLabel(settings.submit_by) : null;
  return <span data-testid="dailies-meta">{todayMeta({ todays, next: next.data, due })}</span>;
}

export function WriterMeta({ project }: { project: ProjectRow }) {
  const f = useDailyForm(project);
  if (f.status !== 'ready') return null;
  return <WriterLine project={project} reportType={f.reportType} settings={parseDailySettings(f.setup?.settings ?? f.settingsFor(f.reportType))} />;
}

export function ReaderMeta({ projectId }: { projectId: string }) {
  const team = useTeamDailies(projectId, true);
  if (!team.data) return null;
  const n = team.data.length;
  return <span data-testid="dailies-meta">{n === 1 ? '1 report' : `${String(n)} reports`}</span>;
}
