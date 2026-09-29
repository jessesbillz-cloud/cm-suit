// Calendar reads (SPEC §7.6). Lines by time range, with each line's job name and time zone; deleted lines never
// come back. What a person may see is RLS's call ("calendar: audience reads"), never the app's. Inspections come from
// each job's calendar_inspections (0043), live, the way the inspections tool shows them.
import { keepPreviousData, skipToken, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import { calendarInspectionSchema, type CalendarFeedState, type CalendarInspection, type CalendarLine, type CalendarRange } from './calendar.types';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import * as mock from './mock/calendar';
import { isMock } from './mock';

/** A cap well above a month of lines on a busy job; a range this full would be split by the view first. */
const RANGE_LIMIT = 2000;

// projects!inner: a line whose job I can't read (or that was deleted) is not a line.
export const LINE_COLS =
  'id, project_id, kind, source_type, source_id, title, location, starts_at, ends_at, all_day, status, version, projects!inner(name, timezone)';

interface LineWithJob {
  id: string;
  project_id: string;
  kind: string;
  source_type: string;
  source_id: string | null;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  status: string | null;
  version: number;
  projects: { name: string; timezone: string };
}

export function flattenLine({ projects, ...row }: LineWithJob): CalendarLine {
  return { ...row, project_name: projects.name, timezone: projects.timezone };
}

async function fetchLines(projectId: string | null, range: CalendarRange): Promise<CalendarLine[]> {
  if (isMock()) return mock.lines(projectId, range);
  let q = supabase
    .from('calendar_entries')
    .select(LINE_COLS)
    .is('deleted_at', null)
    .gte('starts_at', range.from)
    .lt('starts_at', range.to);
  if (projectId !== null) q = q.eq('project_id', projectId);
  const rows: LineWithJob[] = throwIfError(await q.order('starts_at').order('id').limit(RANGE_LIMIT));
  return rows.map(flattenLine);
}

/** Lines starting in [from, to). projectId null = all my jobs. The previous range stays on screen while the next loads. */
export function useCalendarLines(projectId: string | null, range: CalendarRange) {
  return useQuery({
    queryKey: qk.calendarRange(projectId, range.from, range.to),
    queryFn: () => fetchLines(projectId, range),
    placeholderData: keepPreviousData,
  });
}

async function fetchLine(id: string): Promise<CalendarLine | null> {
  if (isMock()) return mock.line(id);
  const row: LineWithJob | null = throwIfErrorMaybe(
    await supabase.from('calendar_entries').select(LINE_COLS).eq('id', id).is('deleted_at', null).maybeSingle(),
  );
  return row === null ? null : flattenLine(row);
}

/** One line (the right column). null = gone or deleted. */
export function useCalendarLine(id: string | null) {
  return useQuery({ queryKey: qk.calendarLine(id ?? ''), queryFn: id ? () => fetchLine(id) : skipToken });
}

async function fetchFeed(): Promise<CalendarFeedState> {
  if (isMock()) return mock.feed();
  // Column grants let me read when my link was made, never its hash.
  return throwIfErrorMaybe(await supabase.from('calendar_feed_tokens').select('rotated_at').maybeSingle());
}

/** My calendar feed link: null until I make one. */
export function useCalendarFeed() {
  return useQuery({ queryKey: qk.calendarFeed, queryFn: fetchFeed });
}

/** Inspections are live: they refresh every 30 seconds while on screen, like the inspections tool. */
const LIVE_MS = 30_000;

/** One job's answer: its id travels with its lines, so a job with none still counts as loaded. */
interface JobInspections {
  projectId: string;
  rows: CalendarInspection[];
}

async function fetchInspections(projectId: string, from: string, to: string): Promise<JobInspections> {
  const rows = isMock()
    ? await mock.inspections(projectId, from, to)
    : z
        .array(calendarInspectionSchema)
        .parse(throwIfError(await supabase.rpc('calendar_inspections', { p_project_id: projectId, p_from: from, p_to: to })));
  return { projectId, rows: rows.map((r) => ({ ...r, project_id: projectId })) };
}

interface CalendarInspections {
  rows: CalendarInspection[];
  /** The jobs whose inspections are here: their mirrored inspection lines give way to these. */
  loaded: ReadonlySet<string>;
  isPending: boolean;
  error: Error | null;
  refetch: () => void;
}

function combineInspections(results: UseQueryResult<JobInspections>[]): CalendarInspections {
  const loaded = new Set<string>();
  const rows: CalendarInspection[] = [];
  for (const r of results) {
    if (!r.data) continue;
    loaded.add(r.data.projectId);
    rows.push(...r.data.rows);
  }
  return {
    rows,
    loaded,
    isPending: results.some((r) => r.isPending),
    error: results.find((r) => r.error !== null)?.error ?? null,
    refetch: () => {
      for (const r of results) if (r.isError) void r.refetch();
    },
  };
}

/**
 * Each job's inspection requests and blocked time from `from` to `to` (yyyy-MM-dd, both included). A job where I may
 * not see inspections answers with none. Keyed under the job's inspections prefix, so every IR write refreshes it.
 */
export function useCalendarInspections(projectIds: readonly string[], from: string, to: string): CalendarInspections {
  return useQueries({
    queries: projectIds.map((id) => ({
      queryKey: qk.inspectionsPart(id, 'calendar-month', `${from}:${to}`),
      queryFn: () => fetchInspections(id, from, to),
      refetchInterval: LIVE_MS,
      placeholderData: keepPreviousData,
    })),
    combine: combineInspections,
  });
}
