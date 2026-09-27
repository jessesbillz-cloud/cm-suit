// scan_file {file_id}: stream the object to disk, hash it, scan it with clamd, record the result.
// Re-runnable: the scan runs only while scan_status is 'pending'; the follow-up steps for a finished scan
// (enqueue text/thumbnail jobs, or notify admins of an infected file) check for existing work before acting.
import { join } from 'node:path';
import { z } from 'zod';
import type { QueueJob } from '../queue.js';
import { run } from '../lib/exec.js';
import { FILES_BUCKET, fileJobPayload, loadFile, type FileRow, type ScanStatus } from '../lib/files.js';
import { classifyMime } from '../lib/pdfSource.js';
import { enqueueJob } from '../lib/queueRpc.js';
import { downloadToFile } from '../lib/storage.js';
import { checked } from '../lib/supabase.js';
import { withTempDir } from '../lib/tmp.js';
import type { HandlerDeps } from './types.js';

// job_kinds.scan_file has a 900 s visibility timeout; leave room for the download and the database writes.
const CLAMDSCAN_TIMEOUT_MS = 12 * 60 * 1000;
const EXCEEDS_LIMIT = /Heuristics\.Limits\.Exceeded|exceeds max/i;
const INFECTED_KIND = 'file_infected';
const ADMIN_CAPABILITY = 'project.manage';
const ACTIVITY_AUDIENCE = 'files.manage';

type Verdict = Exclude<ScanStatus, 'pending'>;

const idRows = z.array(z.object({ id: z.string() }));
const assigneeRows = z.array(z.object({ assignee_user_id: z.string() }));
const roleRows = z.array(z.object({ role: z.string() }));
const userRows = z.array(z.object({ user_id: z.string() }));

export async function scanFile(job: QueueJob, deps: HandlerDeps): Promise<void> {
  const { file_id: fileId } = fileJobPayload.parse(job.payload);
  const file = await loadFile(deps.db, fileId);
  const ctx = { job_id: job.jobId, file_id: fileId };
  if (file.deleted_at !== null) {
    deps.log.info('file was deleted; nothing to scan', ctx);
    return;
  }

  let status: ScanStatus = file.scan_status;
  if (status === 'pending') {
    if (!file.upload_complete) throw new Error('upload not complete yet; will retry');
    status = await scanAndRecord(file, deps);
    deps.log.info('scan finished', { ...ctx, scan_status: status });
  }

  if (status === 'infected') await notifyInfected(file, deps);
  if (status === 'clean') await enqueueFollowUps(file, deps);
}

async function scanAndRecord(file: FileRow, deps: HandlerDeps): Promise<ScanStatus> {
  const result = await withTempDir(deps.env.WORKER_TMP_DIR, async (dir) => {
    const target = join(dir, 'object');
    const { bytes, sha256 } = await downloadToFile(deps.db, FILES_BUCKET, file.storage_path, target);
    const verdict: Verdict = bytes > deps.env.CLAMAV_MAX_BYTES ? 'too_large_to_scan' : await clamScan(target);
    return { bytes, sha256, verdict };
  });

  // Guarded on 'pending' so a concurrent duplicate delivery cannot overwrite a recorded verdict.
  const updated = idRows.parse(checked(
    await deps.db
      .from('files')
      .update({
        scan_status: result.verdict,
        scanned_at: new Date().toISOString(),
        sha256: result.sha256,
        size: result.bytes,
      })
      .eq('id', file.id)
      .eq('scan_status', 'pending')
      .select('id'),
    'record scan result',
  ));
  if (updated.length === 1) return result.verdict;
  // Someone else recorded it first; act on what is stored.
  return (await loadFile(deps.db, file.id)).scan_status;
}

/** clamdscan exit codes: 0 clean, 1 virus found, 2 error. A size/limit alert is never treated as clean. */
async function clamScan(path: string): Promise<Verdict> {
  const result = await run('clamdscan', ['--fdpass', '--no-summary', path], { timeoutMs: CLAMDSCAN_TIMEOUT_MS });
  const output = `${result.stdout}\n${result.stderr}`;
  if (EXCEEDS_LIMIT.test(output)) return 'too_large_to_scan';
  if (result.code === 0) return 'clean';
  if (result.code === 1) return 'infected';
  throw new Error(`clamdscan failed (exit ${result.code}): ${output.trim().slice(-1500)}`);
}

async function enqueueFollowUps(file: FileRow, deps: HandlerDeps): Promise<void> {
  const kind = classifyMime(file.mime);
  // extract_text also records text_status 'none' for types without text, so it runs for every clean file.
  await enqueueJob(deps.db, {
    kind: 'extract_text',
    payload: { file_id: file.id },
    projectId: file.project_id,
    idempotencyKey: `extract_text:${file.id}`,
  });
  if (kind === 'pdf' || kind === 'office' || kind === 'image') {
    await enqueueJob(deps.db, {
      kind: 'thumbnails',
      payload: { file_id: file.id },
      projectId: file.project_id,
      idempotencyKey: `thumbnails:${file.id}`,
    });
  }
}

/** One task per project admin plus one board post for file managers; skips any that already exist. */
async function notifyInfected(file: FileRow, deps: HandlerDeps): Promise<void> {
  const { db } = deps;
  const admins = await projectUsersWithCapability(deps, file.project_id, ADMIN_CAPABILITY);
  const existing = assigneeRows.parse(
    checked(
      await db.from('tasks').select('assignee_user_id').eq('entity_id', file.id).eq('kind', INFECTED_KIND),
      'load existing infected-file tasks',
    ),
  );
  const alreadyTasked = new Set(existing.map((row) => row.assignee_user_id));
  const title = `Infected file blocked: ${file.original_name}`.slice(0, 300);

  for (const admin of admins) {
    if (alreadyTasked.has(admin)) continue;
    checked(
      await db.rpc('create_task', {
        p_project_id: file.project_id,
        p_assignee: admin,
        p_kind: INFECTED_KIND,
        p_title: title,
        p_entity_type: 'file',
        p_entity_id: file.id,
        p_payload: { file_id: file.id },
      }),
      'create infected-file task',
    );
  }
  if (admins.length === 0) {
    deps.log.error('infected file has no project admin to notify', undefined, { file_id: file.id });
  }

  const posted = idRows.parse(
    checked(
      await db.from('activity').select('id').eq('entity_id', file.id).eq('kind', INFECTED_KIND).limit(1),
      'load existing infected-file activity',
    ),
  );
  if (posted.length === 0) {
    checked(
      await db.rpc('post_activity', {
        p_project_id: file.project_id,
        p_kind: INFECTED_KIND,
        p_summary: `A file failed the virus scan and is blocked: ${file.original_name}`,
        p_entity_type: 'file',
        p_entity_id: file.id,
        p_audience_capability: ACTIVITY_AUDIENCE,
      }),
      'post infected-file activity',
    );
  }
}

/** Active members whose role grants `capability` (read from role_permissions; no role names in code). */
async function projectUsersWithCapability(deps: HandlerDeps, projectId: string, capability: string): Promise<string[]> {
  const roles = roleRows
    .parse(checked(await deps.db.from('role_permissions').select('role').eq('capability', capability), 'load roles'))
    .map((row) => row.role);
  if (roles.length === 0) return [];
  const members = userRows.parse(checked(
    await deps.db
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .in('role', roles)
      .not('user_id', 'is', null),
    'load project admins',
  ));
  return [...new Set(members.map((row) => row.user_id))];
}
