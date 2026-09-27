// Corrections log reads (SPEC §13.4). RLS (corrections.view) decides what comes back; rows are parsed with zod.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import * as mockCn from './mock/corrections';
import { isMock } from './mock';
import {
  CORRECTION_COLS,
  HISTORY_COLS,
  correctionHistorySchema,
  correctionSchema,
  type CorrectionHistoryRow,
  type CorrectionRow,
  type PhotoFile,
} from './corrections.types';

async function fetchCorrections(projectId: string): Promise<CorrectionRow[]> {
  if (isMock()) return mockCn.list(projectId);
  const rows: unknown = throwIfError(
    await supabase
      .from('corrections')
      .select(CORRECTION_COLS)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('number', { ascending: false }),
  );
  return z.array(correctionSchema).parse(rows);
}

/** The job's whole log, newest number first. The list, the reading pane and the progress page share it. */
export function useCorrections(projectId: string) {
  return useQuery({ queryKey: qk.correctionsPart(projectId, 'list'), queryFn: () => fetchCorrections(projectId) });
}

async function fetchHistory(correctionId: string): Promise<CorrectionHistoryRow[]> {
  if (isMock()) return mockCn.history(correctionId);
  const rows: unknown = throwIfError(
    await supabase.from('correction_history').select(HISTORY_COLS).eq('correction_id', correctionId).order('seq'),
  );
  return z.array(correctionHistorySchema).parse(rows);
}

/** One item's history, oldest first. */
export function useCorrectionHistory(projectId: string, correctionId: string) {
  return useQuery({ queryKey: qk.correctionsPart(projectId, 'history', correctionId), queryFn: () => fetchHistory(correctionId) });
}

const photoFileSchema = z.object({
  id: z.string(),
  original_name: z.string(),
  mime: z.string(),
  size: z.number(),
  created_at: z.string(),
});

async function fetchPhotoFiles(ids: readonly string[]): Promise<PhotoFile[]> {
  if (isMock()) return mockCn.photoFiles(ids);
  const rows: unknown = throwIfError(
    await supabase.from('files').select('id, original_name, mime, size, created_at').in('id', [...ids]).is('deleted_at', null),
  );
  const found = z.array(photoFileSchema).parse(rows);
  // Keep the order the item lists them in.
  return ids.flatMap((id) => found.filter((f) => f.id === id));
}

/** The file rows behind a set of photo (or notice) ids, in the given order. Files no longer there are left out. */
export function usePhotoFiles(projectId: string, ids: readonly string[]) {
  return useQuery({
    queryKey: qk.correctionsPart(projectId, 'files', ids.join(',')),
    queryFn: ids.length > 0 ? () => fetchPhotoFiles(ids) : skipToken,
  });
}
