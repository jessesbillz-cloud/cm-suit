// The worker's side of the queue: the service-role wrapper RPCs from migration 0006. pgmq itself is never touched.
import { z } from 'zod';
import type { QueueJob, QueueRpc } from '../queue.js';
import { checked, type Db } from './supabase.js';

const jobRowSchema = z.object({
  job_id: z.string().uuid(),
  msg_id: z.number().int(),
  kind: z.string().min(1),
  project_id: z.string().uuid().nullable(),
  payload: z.unknown(),
  attempts: z.number().int(),
});
const failOutcomeSchema = z.enum(['retry', 'dead']);

export class SupabaseQueueRpc implements QueueRpc {
  constructor(private readonly db: Db) {}

  async readJobs(limit: number): Promise<QueueJob[]> {
    const rows = z.array(jobRowSchema).parse(checked(await this.db.rpc('worker_read_jobs', { p_limit: limit }), 'worker_read_jobs'));
    return rows.map((row) => ({
      jobId: row.job_id,
      msgId: row.msg_id,
      kind: row.kind,
      projectId: row.project_id,
      payload: row.payload,
      attempts: row.attempts,
    }));
  }

  async ack(jobId: string, msgId: number): Promise<void> {
    checked(await this.db.rpc('worker_ack_job', { p_job_id: jobId, p_msg_id: msgId }), 'worker_ack_job');
  }

  async fail(jobId: string, msgId: number, error: string): Promise<'retry' | 'dead'> {
    const outcome = checked(
      await this.db.rpc('worker_fail_job', { p_job_id: jobId, p_msg_id: msgId, p_error: error }),
      'worker_fail_job',
    );
    return failOutcomeSchema.parse(outcome);
  }

  async heartbeat(version: string): Promise<void> {
    checked(await this.db.rpc('worker_heartbeat_ping', { p_version: version }), 'worker_heartbeat_ping');
  }
}

interface EnqueueArgs {
  kind: string;
  payload: Record<string, unknown>;
  projectId: string | null;
  idempotencyKey: string;
}

/** Enqueue through the `enqueue_job` wrapper. Safe to repeat: the idempotency key dedupes in the database. */
export async function enqueueJob(db: Db, args: EnqueueArgs): Promise<void> {
  checked(
    await db.rpc('enqueue_job', {
      p_kind: args.kind,
      p_payload: args.payload,
      p_project_id: args.projectId,
      p_idempotency_key: args.idempotencyKey,
    }),
    `enqueue_job ${args.kind}`,
  );
}
