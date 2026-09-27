// r2_copy {since?}: nightly copy of storage objects to Cloudflare R2 (SPEC §6.5 backups).
//
// Enqueued nightly by pg_cron (the migration is added separately; enqueue_job from cron runs without a project):
//   select cron.schedule('nightly-r2-copy', '0 9 * * *',
//     $$select public.enqueue_job('r2_copy', '{}'::jsonb, null, 'r2_copy:' || current_date)$$);
//
// Copies every object under `project/` in the `files` bucket changed since `since` (default: 26 hours ago) to the
// same key in R2, then writes backups/manifest-YYYY-MM-DD.json. Re-runnable: keys are overwritten, and an object
// R2 already holds at the same source version is skipped. One object failing does not stop the rest; the job
// fails at the end so it retries and alerts.
import { z } from 'zod';
import type { QueueJob } from '../queue.js';
import { FILES_BUCKET } from '../lib/files.js';
import { HashingPassThrough } from '../lib/hash.js';
import { errorText } from '../lib/errorText.js';
import { openObject } from '../lib/storage.js';
import type { Db } from '../lib/supabase.js';
import type { HandlerDeps } from './types.js';

const ROOT_PREFIX = 'project';
const LIST_PAGE = 1000;
const DEFAULT_WINDOW_MS = 26 * 60 * 60 * 1000;

const payloadSchema = z.object({ since: z.string().datetime({ offset: true }).optional() });

// storage.list returns folders as entries with a null id.
const entrySchema = z.object({
  name: z.string(),
  id: z.string().nullable(),
  updated_at: z.string().nullable(),
  metadata: z.object({ size: z.number().optional() }).passthrough().nullable(),
});

interface StoredObject {
  key: string;
  updatedAt: string | null;
  size: number | null;
}

interface ManifestEntry {
  key: string;
  size: number;
  sha256?: string;
}

export async function r2Copy(job: QueueJob, deps: HandlerDeps): Promise<void> {
  const { since } = payloadSchema.parse(job.payload);
  const sinceMs = since === undefined ? Date.now() - DEFAULT_WINDOW_MS : Date.parse(since);
  const objects = await listObjects(deps.db, FILES_BUCKET, ROOT_PREFIX);
  const changed = objects.filter((o) => o.updatedAt === null || Date.parse(o.updatedAt) > sinceMs);

  const copied: ManifestEntry[] = [];
  const failed: { key: string; error: string }[] = [];
  let skipped = 0;
  for (const object of changed) {
    try {
      if (await deps.r2.isCurrent(object.key, object.updatedAt, object.size)) {
        skipped += 1;
        copied.push({ key: object.key, size: object.size ?? 0 });
        continue;
      }
      copied.push(await copyOne(deps, object));
    } catch (err) {
      deps.log.error('r2_copy: object failed', err, { job_id: job.jobId, key: object.key });
      failed.push({ key: object.key, error: errorText(err) });
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  await deps.r2.putJson(`backups/manifest-${date}.json`, {
    created_at: new Date().toISOString(),
    since: new Date(sinceMs).toISOString(),
    count: copied.length,
    objects: copied,
    failed,
  });
  deps.log.info('r2_copy finished', {
    job_id: job.jobId,
    listed: objects.length,
    changed: changed.length,
    copied: copied.length - skipped,
    skipped,
    failed: failed.length,
  });
  if (failed.length > 0) throw new Error(`r2_copy: ${failed.length} of ${changed.length} objects failed to copy`);
}

async function copyOne(deps: HandlerDeps, object: StoredObject): Promise<ManifestEntry> {
  const { body, size } = await openObject(deps.db, FILES_BUCKET, object.key);
  const hasher = new HashingPassThrough();
  body.on('error', (err) => {
    hasher.destroy(err);
  });
  await deps.r2.putStream(object.key, body.pipe(hasher), size, object.updatedAt);
  if (size !== null && hasher.bytes !== size) {
    throw new Error(`copied ${hasher.bytes} of ${size} bytes`);
  }
  return { key: object.key, size: hasher.bytes, sha256: hasher.digest() };
}

/** Every object under `root`, walking folders without recursion. */
async function listObjects(db: Db, bucket: string, root: string): Promise<StoredObject[]> {
  const found: StoredObject[] = [];
  const folders = [root];
  for (let prefix = folders.pop(); prefix !== undefined; prefix = folders.pop()) {
    for (let offset = 0; ; offset += LIST_PAGE) {
      const res = await db.storage
        .from(bucket)
        .list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
      if (res.error) throw new Error(`list ${bucket}/${prefix} failed: ${res.error.message}`);
      const entries = z.array(entrySchema).parse(res.data);
      for (const entry of entries) {
        const key = `${prefix}/${entry.name}`;
        if (entry.id === null) folders.push(key);
        else found.push({ key, updatedAt: entry.updated_at, size: entry.metadata?.size ?? null });
      }
      if (entries.length < LIST_PAGE) break;
    }
  }
  return found;
}
