// thumbnails {file_id}: small PNGs of the first 50 pages, stored next to the file (SPEC §8.1 step 3).
// Images use the original object as their thumbnail (no image library is approved for the worker).
// Re-runnable: uploads upsert the same keys and page rows upsert on (file_id, page_no).
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import type { QueueJob } from '../queue.js';
import { runOk } from '../lib/exec.js';
import { FILES_BUCKET, fileJobPayload, loadFile, upsertPages, type FileRow, type ThumbPageRow } from '../lib/files.js';
import { classifyMime, materializePdf, pdfPageCount } from '../lib/pdfSource.js';
import { uploadBuffer } from '../lib/storage.js';
import { checked } from '../lib/supabase.js';
import { withTempDir } from '../lib/tmp.js';
import type { HandlerDeps } from './types.js';

const MAX_THUMB_PAGES = 50;
const PDFTOPPM_TIMEOUT_MS = 10 * 60 * 1000;
const THUMB_FILE = /^thumb-(\d+)\.png$/;

export async function thumbnails(job: QueueJob, deps: HandlerDeps): Promise<void> {
  const { file_id: fileId } = fileJobPayload.parse(job.payload);
  const file = await loadFile(deps.db, fileId);
  if (file.deleted_at !== null || file.scan_status !== 'clean') return;

  const kind = classifyMime(file.mime);
  if (kind === 'image') {
    const row: ThumbPageRow = { file_id: file.id, project_id: file.project_id, page_no: 1, thumbnail_path: file.storage_path };
    await upsertPages(deps.db, [row]);
    return;
  }
  if (kind !== 'pdf' && kind !== 'office') return;
  if (file.page_count !== null && (await thumbCount(deps, file.id)) >= Math.min(file.page_count, MAX_THUMB_PAGES)) return;

  const made = await withTempDir(deps.env.WORKER_TMP_DIR, (dir) => renderAndStore(file, deps, dir));
  deps.log.info('thumbnails stored', { job_id: job.jobId, file_id: fileId, pages: made });
}

async function renderAndStore(file: FileRow, deps: HandlerDeps, dir: string): Promise<number> {
  const pdf = await materializePdf(deps.db, file, dir);
  const last = Math.min(await pdfPageCount(pdf), MAX_THUMB_PAGES);
  if (last < 1) return 0;
  const outDir = join(dir, 'thumbs');
  await mkdir(outDir);
  await runOk('pdftoppm', ['-png', '-r', '40', '-f', '1', '-l', String(last), pdf, join(outDir, 'thumb')], {
    timeoutMs: PDFTOPPM_TIMEOUT_MS,
  });

  // pdftoppm zero-pads the page number to the width of the last page (thumb-01.png ...).
  const baseDir = posix.dirname(file.storage_path);
  const rows: ThumbPageRow[] = [];
  for (const name of await readdir(outDir)) {
    const pageNo = Number(THUMB_FILE.exec(name)?.[1]);
    if (!Number.isInteger(pageNo) || pageNo < 1) continue;
    const key = `${baseDir}/thumbs/p${pageNo}.png`;
    await uploadBuffer(deps.db, FILES_BUCKET, key, await readFile(join(outDir, name)), 'image/png');
    rows.push({ file_id: file.id, project_id: file.project_id, page_no: pageNo, thumbnail_path: key });
  }
  if (rows.length !== last) throw new Error(`pdftoppm produced ${rows.length} of ${last} thumbnails`);
  await upsertPages(deps.db, rows);
  return rows.length;
}

async function thumbCount(deps: HandlerDeps, fileId: string): Promise<number> {
  const res = await deps.db
    .from('file_pages')
    .select('page_no', { count: 'exact', head: true })
    .eq('file_id', fileId)
    .not('thumbnail_path', 'is', null);
  checked(res, 'count thumbnails');
  return res.count ?? 0;
}
