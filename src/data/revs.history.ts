// A wall's history and the files Revs shows (migration 0083; Jesse, Oct 5: "keep the links to all the revs and previous
// inspections from that wall ... you can click on it and expand it over there on the right hand side").
//   * rev_wall_history: every inspection of a wall, per item, newest first: the in-app requests (IR and OFS numbers, the
//     day, the result, whether I may open the request) and the sign-offs before the app (OFS number, day, note, and the
//     OFS IR on file when it was linked).
//   * The job's sign-offs whose OFS IR is on file (rev_signoffs, read as me): a rev strip's done chip opens it.
//   * A room's cropped plan image, or a sign-off's OFS IR: the ir-map function's 'rev_file' action, authorize_rev_file as
//     me (whoever reads revs on the job, those files only, the scan rules), logged as a preview, a 10-minute URL. Its
//     Download ('rev_file_download') asks the same gate, logged as a download, with the original filename.
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { z } from 'zod';
import { saveFile } from '../lib/saveFile';
import { supabase } from './client';
import { DataError, throwIfError } from './errors';
import { callFunction, FunctionError } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockRooms from './mock/revRooms';
import * as mockWalls from './mock/revWalls';

const historyRowSchema = z.object({
  item_id: z.string(),
  kind: z.enum(['request', 'before']),
  request_id: z.string().nullable(),
  ir_number: z.number().int().nullable(),
  ofs_number: z.number().int().nullable(),
  day: z.string().nullable(),
  result: z.enum(['passed', 'failed', 'requested']),
  note: z.string().nullable(),
  file_id: z.string().nullable(),
  file_name: z.string().nullable(),
  can_open: z.boolean(),
  at: z.string().nullable(),
});
export type HistoryRow = z.infer<typeof historyRowSchema>;

async function fetchHistory(projectId: string, areaId: string): Promise<HistoryRow[]> {
  if (isMock()) return mockRooms.history(projectId, areaId);
  return z.array(historyRowSchema).parse(throwIfError(await supabase.rpc('rev_wall_history', { p_area_id: areaId })));
}

/** Every inspection of a wall, per item, newest first. Refreshes with the job's revs. */
export function useWallHistory(projectId: string, areaId: string) {
  return useQuery({ queryKey: qk.revsPart(projectId, `history:${areaId}`), queryFn: () => fetchHistory(projectId, areaId) });
}

const signoffFileSchema = z.object({ area_id: z.string(), item_id: z.string(), file_id: z.string() });
/** A sign-off before the app whose OFS IR is on file (rev_signoffs.file_id, linked by Link files). */
export type SignoffFile = z.infer<typeof signoffFileSchema>;

async function fetchSignoffFiles(projectId: string): Promise<SignoffFile[]> {
  if (isMock()) return mockWalls.signoffFiles(projectId);
  const rows = throwIfError(
    await supabase.from('rev_signoffs').select('area_id, item_id, file_id').eq('project_id', projectId).is('deleted_at', null).not('file_id', 'is', null),
  );
  return z.array(signoffFileSchema).parse(rows);
}

/** The job's sign-offs before the app with their OFS IR on file (RLS: revs.read). Refreshes with the job's revs. */
export function useSignoffFiles(projectId: string) {
  return useQuery({ queryKey: qk.revsPart(projectId, 'signoff-files'), queryFn: () => fetchSignoffFiles(projectId) });
}

const fileSchema = z.object({ url: z.string().url(), filename: z.string().min(1), mime: z.string().min(1) });
export type RevFile = z.infer<typeof fileSchema>;

const FRESH_MS = 8 * 60_000;

async function fetchRevFile(projectId: string, fileId: string): Promise<RevFile> {
  if (isMock()) return mockRooms.file(fileId);
  return callFunction('ir-map', { action: 'rev_file', project_id: projectId, file_id: fileId }, fileSchema);
}

/** A refusal (no access, still being scanned) is an answer: never asked again. A dropped connection is. */
function retryOnce(count: number, e: unknown): boolean {
  const refused = (e instanceof FunctionError && e.status >= 400 && e.status < 500) || e instanceof DataError;
  return !refused && count < 1;
}

function revFileQuery(projectId: string, fileId: string) {
  return {
    queryKey: qk.revsPart(projectId, `file:${fileId}`),
    queryFn: () => fetchRevFile(projectId, fileId),
    staleTime: FRESH_MS,
    gcTime: FRESH_MS,
    retry: retryOnce,
  };
}

/** A room's image or a sign-off's file: its URL, name and type. Nothing until a file is known. */
export function useRevFile(projectId: string, fileId: string | null) {
  return useQuery({
    queryKey: qk.revsPart(projectId, `file:${fileId ?? ''}`),
    queryFn: fileId !== null ? () => fetchRevFile(projectId, fileId) : skipToken,
    staleTime: FRESH_MS,
    gcTime: FRESH_MS,
    retry: retryOnce,
    // A new URL would reload a picture already on screen.
    refetchOnWindowFocus: false,
  });
}

/** For the file viewer: the same cached answer (a tapped thumbnail opens with its picture loaded). */
export function useRevFileFetch(): (projectId: string, fileId: string) => Promise<RevFile> {
  const qc = useQueryClient();
  return useCallback((projectId: string, fileId: string) => qc.query(revFileQuery(projectId, fileId)), [qc]);
}

const downloadSchema = z.object({ url: z.string().url(), filename: z.string().min(1) });

/** One tap: the file saved with its original filename, through the same gate (logged as a download). */
export async function downloadRevFile(projectId: string, fileId: string): Promise<void> {
  if (isMock()) {
    const f = await mockRooms.file(fileId);
    await saveFile(f.url, f.filename);
    return;
  }
  const res = await callFunction('ir-map', { action: 'rev_file_download', project_id: projectId, file_id: fileId }, downloadSchema);
  await saveFile(res.url, res.filename);
}
