// Previews: the ONE way the app gets a file to show (ui/Thumb, ui/FileViewer). A short-lived signed URL for an image or
// a PDF the person may see, from the download function's 'preview' action: authorize_preview (migrations 0047, 0074)
// asks the same gate the download of that file asks (its folder, or the RFI or inspection request it is opened
// through), answers for images and PDFs only, and is not a download (no download line; a 'file.preview' audit line,
// 0054). Cached for less time than the URL lives.
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { DataError } from './errors';
import { callFunction, FunctionError } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockPreview from './mock/preview';

/** Where a file is opened from: its folder (leave it out), or the RFI or inspection request it belongs to. */
export type PreviewVia = { rfiId: string } | { requestId: string };

const previewSchema = z.object({ url: z.string().url() });

/** The URL lives 10 minutes (supabase/functions/_shared/images.ts); the cache hands it out for 8. */
const FRESH_MS = 8 * 60_000;

function viaBody(via: PreviewVia | undefined): { rfi_id?: string; request_id?: string } {
  if (via === undefined) return {};
  return 'rfiId' in via ? { rfi_id: via.rfiId } : { request_id: via.requestId };
}

function viaKey(via: PreviewVia | undefined): string {
  if (via === undefined) return 'folder';
  return 'rfiId' in via ? `rfi:${via.rfiId}` : `request:${via.requestId}`;
}

/** A fresh preview URL for a photo or a PDF (anything else is refused: not_image). */
async function fetchPreviewUrl(fileId: string, via?: PreviewVia): Promise<string> {
  if (isMock()) return mockPreview.previewUrl(fileId);
  const res = await callFunction('download', { action: 'preview', file_id: fileId, ...viaBody(via) }, previewSchema);
  return res.url;
}

/** A refusal (not shown, no access, still being scanned) is an answer: never asked again. A dropped connection is. */
function retryOnce(count: number, e: unknown): boolean {
  const refused = (e instanceof FunctionError && e.status >= 400 && e.status < 500) || e instanceof DataError;
  return !refused && count < 1;
}

function previewQuery(fileId: string, via: PreviewVia | undefined) {
  return {
    queryKey: qk.imagePreview(fileId, viaKey(via)),
    queryFn: () => fetchPreviewUrl(fileId, via),
    staleTime: FRESH_MS,
    gcTime: FRESH_MS,
    retry: retryOnce,
  };
}

/** A photo's or a PDF's preview URL (ui/Thumb), cached for less time than it lives. */
export function usePreviewUrl(fileId: string, via?: PreviewVia) {
  return useQuery({
    ...previewQuery(fileId, via),
    // A new URL would reload a picture already on screen; a stale one is replaced the next time a tile mounts.
    refetchOnWindowFocus: false,
  });
}

/**
 * For the file viewer (ui/FileViewer): `preview(fileId, via?)` resolves to the file's preview URL, sharing the cache
 * with the Thumb tiles (a tapped photo opens with the picture already loaded). An <img> shows a photo's URL; pdf.js
 * reads a PDF's once, whole. A viewer item's `url` is usually `() => preview(file.id)`.
 */
export function usePreviewFetch(): (fileId: string, via?: PreviewVia) => Promise<string> {
  const qc = useQueryClient();
  return useCallback((fileId: string, via?: PreviewVia) => qc.query(previewQuery(fileId, via)), [qc]);
}
