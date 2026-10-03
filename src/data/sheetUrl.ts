// A request map's sheet for the sheet viewer (features/revs/map/SheetMarkup): a fresh signed URL from the ir-map
// function's 'sheet' action. The server asks ir_map_context as the caller (whoever may see the request may see its
// sheet), applies the scan rules, logs it like a download and signs a 10-minute URL without the download header.
// pdf.js reads it once, whole; the cache hands it out for less time than it lives.
import { useQuery } from '@tanstack/react-query';
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
