// Cron: queue health check (SPEC §8.9). Called every minute with `x-cron-secret`.
// A stale worker has no project to assign a task to, so it is reported as an error log line (Sentry / log alerts).
// Service role: cron job; queue_health() is not granted to users.
import { handle, HttpError, ok } from '../_shared/http.ts';
import { rpc, serviceClient } from '../_shared/db.ts';
import { requireCron } from '../_shared/auth.ts';

interface Health {
  queued: number;
  running: number;
  dead: number;
  worker_last_seen: string | null;
  worker_stale: boolean | null;
}

Deno.serve(handle(async (req) => {
  await requireCron(req);
  const rows = await rpc<Health[]>(serviceClient(), 'queue_health');
  const h = rows?.[0] ?? null;
  if (!h) throw new HttpError(500, 'queue_health() returned no row');
  if (h.worker_stale !== false) console.error('[queue-health] WORKER STALE', JSON.stringify(h));
  return ok(req, { ok: h.worker_stale === false, ...h });
}));
