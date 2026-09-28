// Daily report reads (SPEC §13.1). RLS decides what comes back: authors see their own reports and setup,
// dailies.read_all sees the job's submitted reports.
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { DAILY_REPORT_TYPE, DAILY_SETTINGS_DEFAULTS } from '../lib/dailies';
import { useUser } from './auth';
import { supabase } from './client';
import type { Json } from './database.types';
import { PHOTO_COLS, REPORT_COLS, SETUP_COLS, type DailyPhotoRow, type DailyReportRow, type DailySetupRow } from './dailies.types';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import * as mockDailies from './mock/dailies';
import { isMock } from './mock';

/** The per-author number sequence of a report type (next_author_number / peek_author_number). */
const DAILY_NUMBER_KIND = `dailies:${DAILY_REPORT_TYPE}`;

const LIST_LIMIT = 200;

/** My setup for this job, or null before the first one is saved. */
export function useDailySetup(projectId: string) {
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'setup'),
    queryFn: async (): Promise<DailySetupRow | null> =>
      isMock()
        ? mockDailies.setup(projectId)
        : throwIfErrorMaybe(
            await supabase
              .from('daily_setups')
              .select(SETUP_COLS)
              .eq('project_id', projectId)
              .eq('report_type', DAILY_REPORT_TYPE)
              .maybeSingle(),
          ),
  });
}

/**
 * Today's working copy (made by the database on scheduled days, in the job's zone; safe to ask again). Null when today
 * isn't scheduled or today's draft was deleted. Asked again when the window regains focus, so a phone left open
 * overnight finds the new day's report.
 */
export function useTodaysDraft(projectId: string, canWrite: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'today'),
    queryFn: canWrite
      ? async (): Promise<string | null> => {
          const defaults = DAILY_SETTINGS_DEFAULTS as unknown as Json;
          const id = isMock()
            ? await mockDailies.ensureToday(projectId, defaults)
            : throwIfErrorMaybe(
                await supabase.rpc('ensure_todays_draft', {
                  p_project_id: projectId,
                  p_report_type: DAILY_REPORT_TYPE,
                  p_settings_if_new: defaults,
                }),
              );
          // The list may have been read a moment before today's copy (and the setup) were made.
          await Promise.all([
            qc.invalidateQueries({ queryKey: qk.dailiesPart(projectId, 'mine') }),
            qc.invalidateQueries({ queryKey: qk.dailiesPart(projectId, 'setup') }),
          ]);
          return id;
        }
      : skipToken,
  });
}

/** My reports on this job, newest day first (deleted drafts never come back). */
export function useMyDailies(projectId: string, canWrite: boolean) {
  const user = useUser();
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'mine'),
    queryFn: canWrite
      ? async (): Promise<DailyReportRow[]> =>
          isMock()
            ? mockDailies.myReports(projectId)
            : throwIfError(
                await supabase
                  .from('daily_reports')
                  .select(REPORT_COLS)
                  .eq('project_id', projectId)
                  .eq('author_id', user.id)
                  .order('report_date', { ascending: false })
                  .limit(LIST_LIMIT),
              )
      : skipToken,
  });
}

/** Everyone's submitted reports on the job (dailies.read_all). */
export function useTeamDailies(projectId: string, canReadAll: boolean) {
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'team'),
    queryFn: canReadAll
      ? async (): Promise<DailyReportRow[]> =>
          isMock()
            ? mockDailies.teamReports(projectId)
            : throwIfError(
                await supabase
                  .from('daily_reports')
                  .select(REPORT_COLS)
                  .eq('project_id', projectId)
                  .eq('status', 'submitted')
                  .order('report_date', { ascending: false })
                  .order('number', { ascending: false })
                  .limit(LIST_LIMIT),
              )
      : skipToken,
  });
}

export function useDailyReport(projectId: string, reportId: string) {
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'report', reportId),
    queryFn: async (): Promise<DailyReportRow> =>
      isMock()
        ? mockDailies.report(reportId)
        : throwIfError(await supabase.from('daily_reports').select(REPORT_COLS).eq('id', reportId).single()),
  });
}

/** A report's photos, oldest first. Removed ones come too (a removal after submit means it needs resubmitting). */
export function useDailyPhotos(projectId: string, reportId: string) {
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'photos', reportId),
    queryFn: async (): Promise<DailyPhotoRow[]> =>
      isMock()
        ? mockDailies.photos(reportId)
        : throwIfError(
            await supabase
              .from('daily_report_photos')
              .select(PHOTO_COLS)
              .eq('report_id', reportId)
              .order('taken_at', { ascending: true })
              .order('id', { ascending: true }),
          ),
  });
}

/** The number my next submitted report will get ("will be #N"). The database gives it at signing. */
export function useNextDailyNumber(projectId: string, canWrite: boolean) {
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'next'),
    queryFn: canWrite
      ? async (): Promise<number> =>
          isMock()
            ? mockDailies.peek(projectId)
            : throwIfError(await supabase.rpc('peek_author_number', { p_project_id: projectId, p_kind: DAILY_NUMBER_KIND }))
      : skipToken,
  });
}
