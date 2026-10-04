// Daily report reads (SPEC §13.1). RLS decides what comes back: authors see their own reports and setups,
// dailies.read_all sees the job's submitted reports. A person writes one form per job at a time (the setup they chose
// last, lib/dailies activeReportType); today's copy and the number are asked for per form (report type).
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from './auth';
import { supabase } from './client';
import type { Json } from './database.types';
import { companyForms } from '../lib/dailies';
import {
  PHOTO_COLS,
  REPORT_COLS,
  SETUP_COLS,
  companyFormsRowSchema,
  dayFactsSchema,
  type CompanyForms,
  type DailyPhotoRow,
  type DailyReportRow,
  type DailySetupRow,
  type DayFacts,
} from './dailies.types';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import * as mockDailies from './mock/dailies';
import * as mockDailyFacts from './mock/dailyFacts';
import * as mockDailyForms from './mock/dailyForms';
import { isMock } from './mock';

const LIST_LIMIT = 200;

/** My setups on this job (one per form I have used), the one chosen last first. Empty before the first. */
export function useDailySetups(projectId: string) {
  const user = useUser();
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'setups'),
    queryFn: async (): Promise<DailySetupRow[]> =>
      isMock()
        ? mockDailies.setups(projectId)
        : throwIfError(
            await supabase
              .from('daily_setups')
              .select(SETUP_COLS)
              .eq('project_id', projectId)
              .eq('author_id', user.id)
              .order('chosen_at', { ascending: false }),
          ),
  });
}

/**
 * Today's working copy of my form (made by the database on scheduled days, in the job's zone; safe to ask again), and
 * the form's setup from `settingsIfNew` the first time. Null when today isn't scheduled or today's draft was deleted.
 * Asked again when the window regains focus, so a phone left open overnight finds the new day's report.
 */
export function useTodaysDraft(projectId: string, reportType: string, settingsIfNew: Json, canWrite: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'today', reportType),
    queryFn: canWrite
      ? async (): Promise<string | null> => {
          const id = isMock()
            ? await mockDailies.ensureToday(projectId, reportType, settingsIfNew)
            : throwIfErrorMaybe(
                await supabase.rpc('ensure_todays_draft', {
                  p_project_id: projectId,
                  p_report_type: reportType,
                  p_settings_if_new: settingsIfNew,
                }),
              );
          // The list may have been read a moment before today's copy (and the setup) were made.
          await Promise.all([
            qc.invalidateQueries({ queryKey: qk.dailiesPart(projectId, 'mine') }),
            qc.invalidateQueries({ queryKey: qk.dailiesPart(projectId, 'setups') }),
          ]);
          return id;
        }
      : skipToken,
  });
}

/** My reports on this job, every form, newest day first (deleted drafts never come back). */
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

/** My role's daily form on this job (roles.daily_form, e.g. the superintendent's daily), or null: the default until I
 *  pick a form in Setup. */
export function useMyDailyForm(projectId: string) {
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'role-form'),
    queryFn: async (): Promise<string | null> =>
      isMock()
        ? mockDailyFacts.myDailyForm(projectId)
        : throwIfErrorMaybe(await supabase.rpc('my_daily_form', { p_project_id: projectId })),
  });
}

/** The job's company's version of its daily forms (fields ticked, renamed, reordered, its own added), and the company
 *  row's version a save carries. Everyone on the job reads it (the orgs read rule). Waits until the company is known. */
export function useCompanyForms(orgId: string | undefined) {
  return useQuery({
    queryKey: qk.companyForms(orgId ?? ''),
    queryFn:
      orgId === undefined
        ? skipToken
        : async (): Promise<CompanyForms> => {
            if (isMock()) return mockDailyForms.read(orgId);
            const row: unknown = throwIfError(await supabase.from('orgs').select('version, settings').eq('id', orgId).single());
            const org = companyFormsRowSchema.parse(row);
            return { version: org.version, forms: companyForms(org.settings) };
          },
  });
}

/** What the job knows on a day (sign-ins, closed meetings, deliveries, inspection requests), as far as I may read it.
 *  Asked again each time a report opens, so what was posted since fills in. */
export function useDayFacts(projectId: string, day: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'facts', day),
    queryFn: enabled
      ? async (): Promise<DayFacts> =>
          isMock()
            ? mockDailyFacts.dayFacts(projectId, day)
            : dayFactsSchema.parse(throwIfError(await supabase.rpc('daily_day_facts', { p_project_id: projectId, p_day: day })))
      : skipToken,
    refetchOnMount: 'always',
  });
}

/** The number my next submitted report on this form will get ("will be #N"). The database gives it at signing. */
export function useNextDailyNumber(projectId: string, reportType: string, canWrite: boolean) {
  return useQuery({
    queryKey: qk.dailiesPart(projectId, 'next', reportType),
    queryFn: canWrite
      ? async (): Promise<number> =>
          isMock()
            ? mockDailies.peek(projectId, reportType)
            : throwIfError(await supabase.rpc('peek_author_number', { p_project_id: projectId, p_kind: `dailies:${reportType}` }))
      : skipToken,
  });
}
