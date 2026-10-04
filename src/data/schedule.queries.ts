// Schedule reads (migration 0062): where the job's schedule stands, its versions, one version, the current activities
// (paged: a schedule holds up to 5,000 rows and the API answers 1,000 at a time) and a draft's rows. Everything a job
// shows sits under qk.schedule(job), so one refresh after any write.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { DataError, throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/schedule';
import {
  ACTIVITY_COLS,
  activitySchema,
  DRAFT_COLS,
  draftRowSchema,
  statusSchema,
  versionRowSchema,
  versionSchema,
  type Activity,
  type DraftRow,
  type ScheduleStatus,
  type Version,
  type VersionRow,
} from './schedule.types';

/** The API's page size (supabase/config.toml max_rows). */
const PAGE = 1000;
/** A schedule never has more (schedule_import_draft). */
const MAX_PAGES = 5;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new DataError('That item no longer exists.', 'PGRST116', null);
  return row;
}

/** Every page of a list, in order, until a short page. */
async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>, schema: z.ZodType<T>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const rows = z.array(schema).parse(throwIfError(await page(i * PAGE, (i + 1) * PAGE - 1)));
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function fetchStatus(projectId: string): Promise<ScheduleStatus> {
  if (isMock()) return mock.status(projectId);
  return first(z.array(statusSchema).parse(throwIfError(await supabase.rpc('schedule_status', { p_project_id: projectId }))));
}

/** Where the job's schedule stands: the job's today, the current update, its data date and age, drafts waiting. */
export function useScheduleStatus(projectId: string) {
  return useQuery({ queryKey: qk.schedulePart(projectId, 'status'), queryFn: () => fetchStatus(projectId) });
}

async function fetchVersions(projectId: string): Promise<VersionRow[]> {
  if (isMock()) return mock.versions(projectId);
  return z.array(versionRowSchema).parse(throwIfError(await supabase.rpc('schedule_versions_list', { p_project_id: projectId })));
}

/** The job's versions: drafts first (to managers), then the current one, then the older ones. */
export function useScheduleVersions(projectId: string) {
  return useQuery({ queryKey: qk.schedulePart(projectId, 'versions'), queryFn: () => fetchVersions(projectId) });
}

async function fetchVersion(versionId: string): Promise<Version> {
  if (isMock()) return mock.version(versionId);
  return first(z.array(versionSchema).parse(throwIfError(await supabase.rpc('schedule_version', { p_version_id: versionId }))));
}

/** One version with its counts and what I may do with it. */
export function useScheduleVersion(projectId: string, versionId: string) {
  return useQuery({ queryKey: qk.schedulePart(projectId, 'version', versionId), queryFn: () => fetchVersion(versionId) });
}

async function fetchCurrent(projectId: string): Promise<Activity[]> {
  if (isMock()) return mock.current(projectId);
  return allPages((from, to) => supabase.rpc('schedule_current', { p_project_id: projectId }).range(from, to), activitySchema);
}

/** The current version's activities, by start. `enabled` false: not yet (the status says there is none). */
export function useCurrentActivities(projectId: string, enabled = true) {
  return useQuery({
    queryKey: qk.schedulePart(projectId, 'current'),
    queryFn: enabled ? () => fetchCurrent(projectId) : skipToken,
  });
}

async function fetchDraftRows(versionId: string): Promise<DraftRow[]> {
  if (isMock()) return mock.draftRows(versionId);
  return allPages(
    (from, to) =>
      supabase
        .from('schedule_activities')
        .select(DRAFT_COLS)
        .eq('version_id', versionId)
        .is('deleted_at', null)
        .order('sort')
        .order('id')
        .range(from, to),
    draftRowSchema,
  );
}

/** A version's rows in file order, as the review edits them. */
export function useDraftRows(projectId: string, versionId: string) {
  return useQuery({ queryKey: qk.schedulePart(projectId, 'rows', versionId), queryFn: () => fetchDraftRows(versionId) });
}

async function fetchActivity(activityId: string): Promise<Activity> {
  if (isMock()) return mock.activity(activityId);
  const rows = throwIfError(await supabase.from('schedule_activities').select(ACTIVITY_COLS).eq('id', activityId).limit(1));
  return first(z.array(activitySchema).parse(rows));
}

/** One activity (the calendar's look-ahead line opens it). */
export function useScheduleActivity(projectId: string, activityId: string) {
  return useQuery({ queryKey: qk.schedulePart(projectId, 'activity', activityId), queryFn: () => fetchActivity(activityId) });
}
