// Photo previews: the ONE way the app gets a picture to show (ui/Thumb). A short-lived signed URL for an IMAGE the
// person may see, from the download function's 'preview' action: authorize_preview (migration 0047) asks the same gate
// the download of that file asks (its folder, or the RFI or inspection request it is opened through), answers for
// images only, and is not logged as a download. Cached for less time than the URL lives.
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { DataError } from './errors';
import { callFunction, FunctionError } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockPreview from './mock/preview';

/** Where a photo is opened from: its folder (leave it out), or the RFI or inspection request it belongs to. */
export type PreviewVia = { rfiId: string } | { requestId: string };

const previewSchema = z.object({ url: z.string().url() });

/** The URL lives 15 minutes (supabase/functions/_shared/images.ts); the cache hands it out for 12. */
const FRESH_MS = 12 * 60_000;

function viaBody(via: PreviewVia | undefined): { rfi_id?: string; request_id?: string } {
  if (via === undefined) return {};
  return 'rfiId' in via ? { rfi_id: via.rfiId } : { request_id: via.requestId };
}

function viaKey(via: PreviewVia | undefined): string {
  if (via === undefined) return 'folder';
  return 'rfiId' in via ? `rfi:${via.rfiId}` : `request:${via.requestId}`;
}

async function fetchPreview(fileId: string, via: PreviewVia | undefined): Promise<string> {
  if (isMock()) return mockPreview.previewUrl(fileId);
  const res = await callFunction('download', { action: 'preview', file_id: fileId, ...viaBody(via) }, previewSchema);
  return res.url;
}

/** A refusal (not an image, no access, still being scanned) is an answer: never asked again. A dropped connection is. */
function retryOnce(count: number, e: unknown): boolean {
  const refused = (e instanceof FunctionError && e.status >= 400 && e.status < 500) || e instanceof DataError;
  return !refused && count < 1;
}

export function useImageUrl(fileId: string, via?: PreviewVia) {
  return useQuery({
    queryKey: qk.imagePreview(fileId, viaKey(via)),
    queryFn: () => fetchPreview(fileId, via),
    staleTime: FRESH_MS,
    gcTime: FRESH_MS,
    // A new URL would reload a picture already on screen; a stale one is replaced the next time a tile mounts.
    refetchOnWindowFocus: false,
    retry: retryOnce,
  });
}
