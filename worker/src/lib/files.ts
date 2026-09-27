// Reads and writes of `files` and `file_pages` rows. Scan and text fields are worker-only (service role).
import { z } from 'zod';
import { checked, type Db } from './supabase.js';

export const FILES_BUCKET = 'files';
const PAGE_BATCH = 50;

const fileRowSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  storage_path: z.string().min(1),
  original_name: z.string(),
  mime: z.string(),
  size: z.number(),
  scan_status: z.enum(['pending', 'clean', 'infected', 'too_large_to_scan']),
  text_status: z.enum(['pending', 'done', 'none', 'failed']),
  page_count: z.number().int().nullable(),
  upload_complete: z.boolean(),
  deleted_at: z.string().nullable(),
});
export type FileRow = z.infer<typeof fileRowSchema>;
export type ScanStatus = FileRow['scan_status'];

const FILE_COLUMNS =
  'id, project_id, storage_path, original_name, mime, size, scan_status, text_status, page_count, upload_complete, deleted_at';

export const fileJobPayload = z.object({ file_id: z.string().uuid() });

export async function loadFile(db: Db, fileId: string): Promise<FileRow> {
  const row = checked(await db.from('files').select(FILE_COLUMNS).eq('id', fileId).maybeSingle(), 'load file');
  if (row === null) throw new Error(`file ${fileId} not found`);
  return fileRowSchema.parse(row);
}

export async function updateFile(db: Db, fileId: string, patch: Record<string, unknown>): Promise<void> {
  checked(await db.from('files').update(patch).eq('id', fileId), 'update file');
}

interface PageKey {
  file_id: string;
  project_id: string;
  page_no: number;
}
export type TextPageRow = PageKey & { text: string };
export type ThumbPageRow = PageKey & { thumbnail_path: string };

/**
 * Upsert on (file_id, page_no) in batches. Rows in one call must share the same columns: PostgREST only updates the
 * columns sent, so a text upsert never clears a thumbnail and vice versa.
 */
export async function upsertPages(db: Db, rows: readonly (TextPageRow | ThumbPageRow)[]): Promise<void> {
  for (let i = 0; i < rows.length; i += PAGE_BATCH) {
    const batch = rows.slice(i, i + PAGE_BATCH);
    checked(await db.from('file_pages').upsert(batch, { onConflict: 'file_id,page_no' }), 'upsert file pages');
  }
}
