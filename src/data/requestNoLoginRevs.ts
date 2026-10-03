// Revs from the request link with no login (SPEC §6.4 #4, migration 0057). No session: the public request-link function
// answers the job's walls with their status only (by the link token), and a request's map by its private receipt: read
// it, draw it until the inspector records a result, the sheet to draw on, the map PDF made on the server and saved with
// its own filename (lib/saveFile). The revs request itself is useSubmitPublicOfs (requestNoLogin.ts). The walls come in
// the member screens' shapes (revs.types), so the revs picker takes either.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saveFile } from '../lib/saveFile';
import { DataError } from './errors';
import { callFunction, FunctionError } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/requestNoLoginRevs';
import { linkBody } from './requestNoLogin';
import type { LinkKey } from './requestLink.types';
import {
  asPublicRevs,
  publicMapAnswerSchema,
  publicMapFileSchema,
  publicRevsSchema,
  publicSheetSchema,
  type PublicMap,
  type PublicRevs,
} from './requestNoLogin.types';
import type { IrStroke } from './revs.types';

const LIVE_MS = 30_000;
/** A sheet URL lives 10 minutes; the cache hands it out for less. */
const SHEET_FRESH_MS = 8 * 60_000;

async function fetchRevs(key: LinkKey): Promise<PublicRevs> {
  const raw = isMock() ? await mock.revs(key) : await callFunction('request-link', { action: 'revs', ...linkBody(key) }, publicRevsSchema);
  return asPublicRevs(key.projectId, raw);
}

/** The job's lists, revs, items and walls, and each wall x item's status (open, requested, passed, N/A). Empty on a job
 *  without OFS; a dead link rejects with FunctionError 404. */
export function usePublicRevs(key: LinkKey) {
  return useQuery({ queryKey: qk.requestLinkRevs(key.projectId, key.hubId ?? 'job'), queryFn: () => fetchRevs(key), retry: false });
}

function receiptBody(projectId: string, receipt: string) {
  return { project_id: projectId, receipt };
}

/** A request's map by its receipt: null when the request has no walls. Live while on screen (a result can land). */
export function usePublicMap(projectId: string, receipt: string) {
  return useQuery({
    queryKey: qk.publicMap(projectId, receipt),
    queryFn: async (): Promise<PublicMap | null> => {
      const res = isMock()
        ? await mock.map(projectId, receipt)
        : await callFunction('request-link', { action: 'map', ...receiptBody(projectId, receipt) }, publicMapAnswerSchema);
      return res.map;
    },
    retry: false,
    refetchInterval: LIVE_MS,
  });
}

interface PublicMapSave {
  version: number;
  strokes: IrStroke[];
  /** A new sheet (one of `sheets`) or null = keep; a new page or null = keep. */
  sheetFileId: string | null;
  page: number | null;
}

/** Saves what the visitor drew (version-checked); the answer is the map as it is now (its next version). */
export function useSavePublicMap(projectId: string, receipt: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: PublicMapSave): Promise<PublicMap | null> => {
      const res = isMock()
        ? await mock.saveMap(projectId, receipt, v)
        : await callFunction('request-link', {
          action: 'map_save', ...receiptBody(projectId, receipt), version: v.version, strokes: v.strokes, sheet_file_id: v.sheetFileId,
          page: v.page,
        }, publicMapAnswerSchema);
      return res.map;
    },
    // The next save carries the new version at once.
    onSuccess: (map) => qc.setQueryData(qk.publicMap(projectId, receipt), map),
    onError: () => qc.invalidateQueries({ queryKey: qk.publicMap(projectId, receipt) }),
  });
}

/** A refusal (no sheet yet, still being scanned, a wrong receipt) is an answer: never asked again. A dropped connection is. */
function retryOnce(count: number, e: unknown): boolean {
  const refused = (e instanceof FunctionError && e.status >= 400 && e.status < 500) || e instanceof DataError;
  return !refused && count < 1;
}

/** The map's sheet for the sheet viewer: a short-lived URL, per sheet. `sheetFileId` null = no sheet yet. */
export function usePublicSheetUrl(projectId: string, receipt: string, sheetFileId: string | null) {
  return useQuery({
    queryKey: qk.publicSheetUrl(projectId, receipt, sheetFileId ?? ''),
    queryFn: async (): Promise<string> => {
      if (isMock()) return mock.sheetUrl(projectId, receipt);
      return (await callFunction('request-link', { action: 'sheet', ...receiptBody(projectId, receipt) }, publicSheetSchema)).url;
    },
    enabled: sheetFileId !== null,
    staleTime: SHEET_FRESH_MS,
    gcTime: SHEET_FRESH_MS,
    // A new URL would reopen the sheet on screen.
    refetchOnWindowFocus: false,
    retry: retryOnce,
  });
}

/** Makes the map PDF on the server (or keeps the one on file when it shows exactly this); answers the map. */
export function useRenderPublicMap(projectId: string, receipt: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<PublicMap | null> => {
      const res = isMock()
        ? await mock.renderMap(projectId, receipt)
        : await callFunction('request-link', { action: 'map_render', ...receiptBody(projectId, receipt) }, publicMapAnswerSchema);
      return res.map;
    },
    onSuccess: (map) => qc.setQueryData(qk.publicMap(projectId, receipt), map),
  });
}

/** The map PDF, saved with its own filename (made first when out of date). */
export function useDownloadPublicMap(projectId: string, receipt: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = isMock()
        ? await mock.downloadMap(projectId, receipt)
        : await callFunction('request-link', { action: 'map_download', ...receiptBody(projectId, receipt) }, publicMapFileSchema);
      await saveFile(res.url, res.filename);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.publicMap(projectId, receipt) }),
  });
}
