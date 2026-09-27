// Jobs are enqueued only through the enqueue_job RPC (SPEC §8.9). pgmq itself is never exposed.
import { type Db, rpc } from './db.ts';

/** Returns the job id. Safe to repeat: the same idempotency key returns the existing job. */
export async function enqueue(
  client: Db,
  kind: string,
  payload: Record<string, unknown>,
  projectId: string | null,
  idempotencyKey?: string,
  holdUntil?: string,
): Promise<string> {
  return await rpc<string>(client, 'enqueue_job', {
    p_kind: kind,
    p_payload: payload,
    p_project_id: projectId,
    p_idempotency_key: idempotencyKey ?? null,
    p_hold_until: holdUntil ?? null,
  });
}
