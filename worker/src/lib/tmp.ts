// Private temp directory per job, always removed afterwards.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { log } from './log.js';

export async function withTempDir<T>(base: string | undefined, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(base ?? tmpdir(), 'cmw-'));
  try {
    return await fn(dir);
  } finally {
    // Cleanup failure must not mask the job's own error; it is reported instead.
    await rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
      log.error('temp dir cleanup failed', err, { dir });
    });
  }
}
