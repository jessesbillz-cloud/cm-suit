// The folder's rows, told apart: files, and my own uploads that never finished (storage refused them, I stopped them,
// or the page closed). An unfinished upload is not a file: it shows as a line to remove, or resumes when the same
// file is added again. Other people's unfinished uploads never reach here (data/queries fetchFiles).
import type { UploadItem } from '../../data/UploadQueue';
import type { FileRow } from '../../data/types';

/** The rows that are files. */
export function storedFiles(rows: readonly FileRow[]): FileRow[] {
  return rows.filter((f) => f.upload_complete);
}

/** Does this line of the upload queue stand for that unfinished row? */
function covers(item: UploadItem, row: FileRow): boolean {
  if (item.unfinishedId !== null) return item.unfinishedId === row.id;
  // Not registered yet: the same file waiting or starting in this folder is about to pick the row up again.
  const active = item.status === 'queued' || item.status === 'uploading';
  return active && item.folderId === row.folder_id && item.name === row.original_name && item.size === row.size;
}

/** My unfinished uploads that have no line in the upload queue: left by an earlier visit. */
export function leftoverUploads(rows: readonly FileRow[], items: readonly UploadItem[]): FileRow[] {
  return rows.filter((f) => !f.upload_complete && !items.some((i) => covers(i, f)));
}
