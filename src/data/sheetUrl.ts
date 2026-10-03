// Plan sheets for the sheet viewer (features/revs/map): a fresh signed URL from the ir-map function.
//   - A request map's sheet ('sheet'): the server asks ir_map_context as the caller (whoever may see the request may see
//     its sheet).
//   - A plan sheet in Revs ('plan', 0059: the plan view and a wall's thumbnail): authorize_rev_sheet as the caller
//     (whoever reads revs, for a sheet a wall is on; a manager, any PDF of the job he may read).
// Either way the server applies the scan rules, logs it like a download and signs a 10-minute URL without the download
// header. pdf.js reads it once, whole; the cache hands it out for less time than it lives.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { DataError } from './errors';
import { callFunction, FunctionError } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockSheet from './mock/sheet';

const sheetSchema = z.object({ url: z.string().url() });

const FRESH_MS = 8 * 60_000;

async function fetchSheetUrl(requestId: string): Promise<string> {
  if (isMock()) return mockSheet.sheetUrl();
  const res = await callFunction('ir-map', { action: 'sheet', request_id: requestId }, sheetSchema);
  return res.url;
}

/** A refusal (no access, no sheet yet, still being scanned) is an answer: never asked again. A dropped connection is. */
function retryOnce(count: number, e: unknown): boolean {
  const refused = (e instanceof FunctionError && e.status >= 400 && e.status < 500) || e instanceof DataError;
  return !refused && count < 1;
}

/** The sheet of a request's map. `sheetFileId` (ir_map_context.sheet_file_id) is null until a sheet is picked. */
export function useSheetUrl(requestId: string, sheetFileId: string | null) {
  return useQuery({
    queryKey: qk.sheetUrl(requestId, sheetFileId ?? ''),
    queryFn: () => fetchSheetUrl(requestId),
    enabled: sheetFileId !== null,
    staleTime: FRESH_MS,
    gcTime: FRESH_MS,
    // A new URL would reopen the sheet on screen; a stale one is replaced the next time the map opens.
    refetchOnWindowFocus: false,
    retry: retryOnce,
  });
}

async function fetchPlanUrl(projectId: string, fileId: string): Promise<string> {
  if (isMock()) return mockSheet.sheetUrl();
  const res = await callFunction('ir-map', { action: 'plan', project_id: projectId, file_id: fileId }, sheetSchema);
  return res.url;
}

/** A plan sheet of the job's walls (Revs: the plan view, a wall's thumbnail). Nothing until a sheet is known. */
export function usePlanSheetUrl(projectId: string, fileId: string | null) {
  return useQuery({
    queryKey: qk.planSheetUrl(projectId, fileId ?? ''),
    queryFn: fileId !== null ? () => fetchPlanUrl(projectId, fileId) : skipToken,
    staleTime: FRESH_MS,
    gcTime: FRESH_MS,
    refetchOnWindowFocus: false,
    retry: retryOnce,
  });
}
