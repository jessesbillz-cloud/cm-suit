// Cron (0112): copies the files of requests mirrored from My Daily Reports into private storage. Called by pg_cron
// (mdr_files_cron, 03:15 to 05:45 UTC) and at the end of each day's import, with `x-cron-secret`.
// Each queued link is fetched only from MDR_PUBLIC_HOST (refused when unset), at most 250 MB, stored with the one
// server store (_shared/generatedPdf.ts storeServerFile) in the folder mdr_file_claim answers, then linked by
// mdr_file_done. A failure is tried again on a later run, three tries in all. A link to anywhere else is refused for good.
// Service role: cron job. The queue and its steps (mdr_file_claim / done / failed) are the server's alone.
import { handle, ok } from '../_shared/http.ts';
import { type Db, rpc, serviceClient } from '../_shared/db.ts';
import { requireCron } from '../_shared/auth.ts';
import { storeServerFile } from '../_shared/generatedPdf.ts';
import { mdrHost, mdrNameOf, MdrRefused, mdrSourceUrl, readCapped, typed } from '../_shared/mdrFiles.ts';

interface Claimed {
  id: string;
  url: string;
  role: 'attachment' | 'ir_pdf';
  project_id: string;
  request_id: string;
  number: number;
  folder_id: string;
}

/** Stop taking new files after this, so a run ends well inside the platform's limit. */
const BUDGET_MS = 110_000;
const BATCH = 5;

async function copyOne(service: Db, host: string, c: Claimed): Promise<void> {
  const src = mdrSourceUrl(c.url, host);
  const res = await fetch(src, { redirect: 'error', signal: AbortSignal.timeout(90_000) });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`MDR answered ${res.status}`);
  }
  const bytes = await readCapped(res);
  const file = typed(bytes, mdrNameOf(src) || `IR ${c.number}`);
  if (c.role === 'ir_pdf' && file.mime !== 'application/pdf') throw new MdrRefused('The IR PDF is not a PDF');
  const stored = await storeServerFile(service, {
    projectId: c.project_id,
    folderId: c.folder_id,
    name: file.name,
    bytes,
    mime: file.mime,
    // MDR made its IR PDF from its saved record. An attachment is a person's upload: scanned like any upload.
    scanned: c.role === 'ir_pdf',
    createdBy: null,
  });
  await rpc(service, 'mdr_file_done', { p_id: c.id, p_file_id: stored.id });
}

Deno.serve(handle(async (req) => {
  await requireCron(req);
  const host = mdrHost();
  const service = serviceClient();
  const started = Date.now();
  let done = 0;
  let failed = 0;
  let refused = 0;
  while (Date.now() - started < BUDGET_MS) {
    const batch = await rpc<Claimed[]>(service, 'mdr_file_claim', { p_limit: BATCH });
    if (batch.length === 0) break;
    for (const c of batch) {
      try {
        await copyOne(service, host, c);
        done += 1;
      } catch (e) {
        const isRefused = e instanceof MdrRefused;
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[mdr-files] ${isRefused ? 'refused' : 'failed'} ${c.id}: ${message}`);
        await rpc(service, 'mdr_file_failed', { p_id: c.id, p_error: message, p_refused: isRefused });
        if (isRefused) refused += 1;
        else failed += 1;
      }
    }
  }
  return ok(req, { done, failed, refused });
}));
