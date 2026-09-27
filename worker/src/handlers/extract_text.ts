// extract_text {file_id}: per-page text into file_pages for search (SPEC §8.1 step 2).
// PDFs directly; Word/Excel via LibreOffice → PDF; everything else gets text_status 'none'.
// Re-runnable: skips files already 'done'/'none'; page rows are upserted on (file_id, page_no).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { QueueJob } from '../queue.js';
import { runOk } from '../lib/exec.js';
import { fileJobPayload, loadFile, updateFile, upsertPages, type FileRow, type TextPageRow } from '../lib/files.js';
import { errorText } from '../lib/errorText.js';
import { classifyMime, materializePdf, pdfPageCount } from '../lib/pdfSource.js';
import { withTempDir } from '../lib/tmp.js';
import type { HandlerDeps } from './types.js';

const PDFTOTEXT_TIMEOUT_MS = 20 * 60 * 1000;

export async function extractText(job: QueueJob, deps: HandlerDeps): Promise<void> {
  const { file_id: fileId } = fileJobPayload.parse(job.payload);
  const file = await loadFile(deps.db, fileId);
  const ctx = { job_id: job.jobId, file_id: fileId };

  if (file.deleted_at !== null || file.text_status === 'done' || file.text_status === 'none') return;
  if (file.scan_status !== 'clean') {
    deps.log.info('extract_text skipped: file is not clean', { ...ctx, scan_status: file.scan_status });
    return;
  }

  const kind = classifyMime(file.mime);
  if (kind !== 'pdf' && kind !== 'office') {
    await updateFile(deps.db, file.id, { text_status: 'none' });
    return;
  }

  try {
    const pageCount = await extractPages(file, deps);
    await updateFile(deps.db, file.id, { text_status: 'done', page_count: pageCount });
    deps.log.info('text extracted', { ...ctx, pages: pageCount });
  } catch (err) {
    await updateFile(deps.db, file.id, { text_status: 'failed' }).catch((markErr: unknown) => {
      deps.log.error('could not mark text_status failed', markErr, { ...ctx, cause: errorText(err) });
    });
    throw err;
  }
}

async function extractPages(file: FileRow, deps: HandlerDeps): Promise<number> {
  return withTempDir(deps.env.WORKER_TMP_DIR, async (dir) => {
    const pdf = await materializePdf(deps.db, file, dir);
    const pageCount = await pdfPageCount(pdf);
    const textPath = join(dir, 'text.txt');
    // One pass for the whole document; pdftotext ends every page with a form feed.
    await runOk('pdftotext', ['-layout', '-enc', 'UTF-8', pdf, textPath], { timeoutMs: PDFTOTEXT_TIMEOUT_MS });
    const pages = splitPages(await readFile(textPath, 'utf8'), pageCount);
    const rows: TextPageRow[] = pages.map((text, i) => ({
      file_id: file.id,
      project_id: file.project_id,
      page_no: i + 1,
      text,
    }));
    await upsertPages(deps.db, rows);
    return pageCount;
  });
}

/** Split pdftotext output on form feeds into exactly `pageCount` pages. Postgres text cannot hold NUL. */
function splitPages(raw: string, pageCount: number): string[] {
  const parts = raw.replaceAll('\u0000', '').split('\f');
  const pages: string[] = [];
  for (let i = 0; i < pageCount; i += 1) pages.push((parts[i] ?? '').trimEnd());
  return pages;
}
