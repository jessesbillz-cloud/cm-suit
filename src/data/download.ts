// One-click download with the original filename (SPEC §6.5, §8.1): fresh signed URL per click, then lib/saveFile.
import { z } from 'zod';
import { canShareFiles, saveFile } from '../lib/saveFile';
import { FunctionError, callFunction } from './functions';
import * as mock from './mock/api';
import { isMock } from './mock';

const downloadSchema = z.object({ url: z.string().url(), filename: z.string().min(1), mime: z.string() });

/** Files up to this size go through the phone share sheet as bytes; bigger ones download by URL. */
const SHARE_SHEET_MAX_BYTES = 50 * 1024 * 1024;

const FRIENDLY: Record<string, string> = {
  forbidden: "You don't have access to this file.",
  view_only: 'This folder is view-only. Open the file to view it.',
  infected: 'This file failed the virus scan and cannot be downloaded.',
  scan_pending: 'This file is still being scanned. Try again in a minute.',
};

/** Turns a download refusal into one sentence people understand. */
export function downloadErrorMessage(e: unknown): string {
  if (e instanceof FunctionError) return FRIENDLY[e.message] ?? e.message;
  return e instanceof Error ? e.message : 'The download failed.';
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The download failed (${String(res.status)}).`);
  return res.blob();
}

export async function downloadFile(fileId: string, sizeHint?: number): Promise<void> {
  if (isMock()) {
    const { blob, filename } = await mock.download(fileId);
    await saveFile(blob, filename);
    return;
  }
  const res = await callFunction('download', { file_id: fileId }, downloadSchema);
  if (canShareFiles() && sizeHint !== undefined && sizeHint <= SHARE_SHEET_MAX_BYTES) {
    await saveFile(await fetchBlob(res.url), res.filename);
    return;
  }
  await saveFile(res.url, res.filename);
}

/** Share-link downloads (the public `share` endpoint already returned a fresh signed URL). */
export async function saveSignedUrl(url: string, filename: string): Promise<void> {
  await saveFile(url, filename);
}
