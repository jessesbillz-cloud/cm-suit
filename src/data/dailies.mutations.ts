// Daily report writes (SPEC §13.1). Every save carries a version check; numbers, dates and ids come from the database.
// Submitting and emailing go through edge functions (signed record, email out); photos through the one upload queue.
// Setups, today's copy, numbers and past dates are per form (report type): the one the person writes on the job.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import type { Json } from './database.types';
import { emailResultSchema, submitResultSchema, type DailyPhotoRow, type DailyReportRow, type DailySetupRow } from './dailies.types';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import * as mockDailies from './mock/dailies';
import { isMock } from './mock';
import { useUploadQueue } from './UploadQueue';

interface SetupSave {
  reportType: string;
  settings: Json;
  version: number | null;
}

export function useSaveDailySetup(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportType, settings, version }: SetupSave): Promise<DailySetupRow> => {
      if (isMock()) return mockDailies.saveSetup(projectId, reportType, settings, version);
      // A first save has no version yet; the RPC then refuses if a setup appeared meanwhile.
      const args = { p_project_id: projectId, p_report_type: reportType, p_settings: settings };
      return throwIfError(await supabase.rpc('save_daily_setup', version === null ? args : { ...args, p_version: version }));
    },
    onSuccess: async (row) => {
      qc.setQueryData<DailySetupRow[]>(qk.dailiesPart(projectId, 'setups'), (list) =>
        list?.some((s) => s.id === row.id) ? list.map((s) => (s.id === row.id ? row : s)) : [row, ...(list ?? [])],
      );
      // Schedule days may have changed: ask for today's working copy again.
      await qc.invalidateQueries({ queryKey: qk.dailiesPart(projectId, 'today', row.report_type) });
    },
  });
}

/** Switches the form I write on this job (making its setup from `settingsIfNew` the first time). */
export function useChooseDailyForm(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportType, settingsIfNew }: { reportType: string; settingsIfNew: Json }): Promise<DailySetupRow> =>
      isMock()
        ? mockDailies.chooseForm(projectId, reportType, settingsIfNew)
        : throwIfError(
            await supabase.rpc('choose_daily_form', { p_project_id: projectId, p_report_type: reportType, p_settings_if_new: settingsIfNew }),
          ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.dailies(projectId) }),
  });
}

/** The number my next report on this form gets; continues an earlier sequence. The database keeps it. */
export function useSetDailyStartNumber(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportType, start }: { reportType: string; start: number }): Promise<number> =>
      isMock()
        ? mockDailies.setStartNumber(projectId, reportType, start)
        : throwIfError(await supabase.rpc('set_daily_start_number', { p_project_id: projectId, p_report_type: reportType, p_start: start })),
    onSuccess: (_n, v) => qc.invalidateQueries({ queryKey: qk.dailiesPart(projectId, 'next', v.reportType) }),
  });
}

/** "Past date" and Start: the report for that day on that form (made, or a deleted draft brought back). Answers its id. */
export function useCreateDailyReport(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportType, reportDate }: { reportType: string; reportDate: string }): Promise<string> =>
      isMock()
        ? mockDailies.createReport(projectId, reportType, reportDate)
        : throwIfError(
            await supabase.rpc('create_daily_report', { p_project_id: projectId, p_report_type: reportType, p_report_date: reportDate }),
          ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.dailies(projectId) }),
  });
}

/** Autosave: the whole content with the version it was read at. A conflict throws (code 40001); it never overwrites. */
export function useSaveDailyContent(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, version, content }: { reportId: string; version: number; content: Json }): Promise<DailyReportRow> =>
      isMock()
        ? mockDailies.saveContent(reportId, version, content)
        : throwIfError(await supabase.rpc('save_daily_content', { p_report_id: reportId, p_version: version, p_content: content })),
    onSuccess: (row) => {
      qc.setQueryData(qk.dailiesPart(projectId, 'report', row.id), row);
      qc.setQueryData<DailyReportRow[]>(qk.dailiesPart(projectId, 'mine'), (list) => list?.map((r) => (r.id === row.id ? row : r)));
    },
  });
}

export function useDeleteDailyDraft(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, version }: { reportId: string; version: number }): Promise<void> => {
      if (isMock()) return mockDailies.deleteDraft(reportId, version);
      throwIfErrorMaybe(await supabase.rpc('delete_daily_draft', { p_report_id: reportId, p_version: version }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.dailies(projectId) }),
  });
}

async function photoFolder(projectId: string): Promise<string> {
  if (isMock()) return mockDailies.photoFolder(projectId);
  return throwIfError(await supabase.rpc('daily_photo_folder', { p_project_id: projectId }));
}

async function linkPhoto(reportId: string, fileId: string, rowKey: string | null, takenAt: number): Promise<DailyPhotoRow> {
  const at = new Date(takenAt).toISOString();
  if (isMock()) return mockDailies.addPhoto(reportId, fileId, rowKey, at);
  return throwIfError(
    await supabase.rpc('add_daily_photo', { p_report_id: reportId, p_file_id: fileId, p_row_key: rowKey ?? '', p_caption: '', p_taken_at: at }),
  );
}

export interface PhotoPick {
  /** Already compressed and stamped (lib/compressPhoto). */
  file: File;
  /** When it was taken (ms since epoch). */
  takenAt: number;
}

/** Where a photo lands: the report, and the work-log row it was started from (or null). */
interface PhotoTarget {
  reportId: string;
  rowKey: string | null;
}

function photoFolderKey(projectId: string) {
  return qk.dailiesPart(projectId, 'photo_folder');
}

/**
 * Photos onto a report: each file goes through the ONE upload queue (resumable, retried, survives route changes) into
 * Photos/<me>, then is linked to the report. No save step for the person.
 */
export function useAddDailyPhotos(projectId: string) {
  const qc = useQueryClient();
  const queue = useUploadQueue();
  return useMutation({
    mutationFn: async ({ picks, target }: { picks: PhotoPick[]; target: PhotoTarget }): Promise<void> => {
      const folderId = await qc.query({ queryKey: photoFolderKey(projectId), queryFn: () => photoFolder(projectId), staleTime: 'static' });
      for (const pick of picks) {
        queue.enqueue([pick.file], projectId, folderId, async (fileId) => {
          await linkPhoto(target.reportId, fileId, target.rowKey, pick.takenAt);
          await qc.invalidateQueries({ queryKey: qk.dailiesPart(projectId, 'photos', target.reportId) });
          return null;
        });
      }
    },
  });
}

/** The upload lines of my daily photos on this job (for "Uploading" and Retry on the report). */
export function useDailyPhotoUploads(projectId: string) {
  const qc = useQueryClient();
  const queue = useUploadQueue();
  const folderId = qc.getQueryData<string>(photoFolderKey(projectId));
  return { items: folderId === undefined ? [] : queue.items.filter((i) => i.folderId === folderId), retry: queue.retry };
}

/** A photo's caption, and its description when given (undefined leaves the description as it is). */
export function useSaveDailyPhoto(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ photo, caption, description }: { photo: DailyPhotoRow; caption: string; description?: string }): Promise<DailyPhotoRow> =>
      isMock()
        ? mockDailies.savePhoto(photo.id, photo.version, caption, description)
        : throwIfError(
            await supabase.rpc('save_daily_photo', {
              p_photo_id: photo.id,
              p_version: photo.version,
              p_caption: caption,
              ...(description === undefined ? {} : { p_description: description }),
            }),
          ),
    onSuccess: (row) => qc.invalidateQueries({ queryKey: qk.dailiesPart(projectId, 'photos', row.report_id) }),
  });
}

export function useRemoveDailyPhoto(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photo: DailyPhotoRow): Promise<void> => {
      if (isMock()) return mockDailies.removePhoto(photo.id, photo.version);
      throwIfErrorMaybe(await supabase.rpc('remove_daily_photo', { p_photo_id: photo.id, p_version: photo.version }));
    },
    onSettled: (_data, _err, photo) => qc.invalidateQueries({ queryKey: qk.dailiesPart(projectId, 'photos', photo.report_id) }),
  });
}

/** Signs and submits (submit-daily): the server numbers it, renders and stores the PDF, then marks it submitted. */
export function useSubmitDaily(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, version }: { reportId: string; version: number }) =>
      isMock()
        ? mockDailies.submit(reportId, version)
        : callFunction('submit-daily', { report_id: reportId, version }, submitResultSchema),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.dailies(projectId) }),
        qc.invalidateQueries({ queryKey: qk.folders(projectId) }),
        qc.invalidateQueries({ queryKey: ['files'] }),
      ]);
    },
  });
}

/** "Email to team": the author presses Send; recipients come from the setup, on the server. */
export function useEmailDaily() {
  return useMutation({
    mutationFn: (reportId: string) =>
      isMock() ? mockDailies.email(reportId) : callFunction('email-daily', { report_id: reportId }, emailResultSchema),
  });
}
