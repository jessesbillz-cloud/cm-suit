// Queue consumer (SPEC §8.9). Polls `worker_read_jobs`, runs up to 3 jobs at once, acks or fails each one.
// Retries, backoff between attempts and dead-lettering live in the database (`worker_fail_job`).
// Handlers must be safe to re-run: a job can be delivered again after a crash or a visibility timeout.
import { errorText } from './lib/errorText.js';
import type { Logger } from './lib/log.js';

export interface QueueJob {
  jobId: string;
  msgId: number;
  kind: string;
  projectId: string | null;
  payload: unknown;
  attempts: number;
}

export interface QueueRpc {
  readJobs(limit: number): Promise<QueueJob[]>;
  ack(jobId: string, msgId: number): Promise<void>;
  fail(jobId: string, msgId: number, error: string): Promise<'retry' | 'dead'>;
}

export type JobHandler = (job: QueueJob) => Promise<void>;

interface QueueRunnerOptions {
  rpc: QueueRpc;
  handlers: ReadonlyMap<string, JobHandler>;
  log: Logger;
  readLimit?: number;
  maxConcurrency?: number;
}

const READ_LIMIT = 5;
const MAX_CONCURRENCY = 3;
const IDLE_MIN_MS = 2000;
const IDLE_MAX_MS = 10_000;

/** Sleep after the Nth empty poll in a row: 2s, 4s, 8s, then 10s. */
export function idleDelayMs(consecutiveEmptyPolls: number): number {
  const n = Math.max(1, Math.floor(consecutiveEmptyPolls));
  return Math.min(IDLE_MAX_MS, IDLE_MIN_MS * 2 ** (n - 1));
}

export class QueueRunner {
  private stopping = false;
  private readonly inFlight = new Set<Promise<void>>();
  private emptyPolls = 0;
  private wakeSleeper: (() => void) | null = null;
  private readonly readLimit: number;
  private readonly maxConcurrency: number;

  constructor(private readonly opts: QueueRunnerOptions) {
    this.readLimit = opts.readLimit ?? READ_LIMIT;
    this.maxConcurrency = opts.maxConcurrency ?? MAX_CONCURRENCY;
  }

  /** Poll until `stop()`; then wait for jobs already running. Never rejects. */
  async run(): Promise<void> {
    while (!this.stopping) {
      if (this.inFlight.size >= this.maxConcurrency) {
        await Promise.race(this.inFlight);
        continue;
      }
      let started = 0;
      try {
        started = await this.pollOnce();
      } catch (err) {
        this.opts.log.error('queue poll failed', err);
      }
      if (started === 0) {
        this.emptyPolls += 1;
        await this.sleep(idleDelayMs(this.emptyPolls));
      } else {
        this.emptyPolls = 0;
      }
    }
    await this.drain();
  }

  /** Ask the loop to stop after the current poll. Jobs in flight are allowed to finish. */
  stop(): void {
    this.stopping = true;
    this.wakeSleeper?.();
  }

  /** Read as many jobs as there are free slots (at most `readLimit`) and start them. Returns how many started. */
  async pollOnce(): Promise<number> {
    const free = this.maxConcurrency - this.inFlight.size;
    if (free <= 0) return 0;
    const jobs = await this.opts.rpc.readJobs(Math.min(this.readLimit, free));
    for (const job of jobs) this.start(job);
    return jobs.length;
  }

  /** Wait for every job currently running. */
  async drain(): Promise<void> {
    await Promise.all([...this.inFlight]);
  }

  private start(job: QueueJob): void {
    const running: Promise<void> = this.runJob(job).finally(() => {
      this.inFlight.delete(running);
    });
    this.inFlight.add(running);
  }

  /** Runs one job to completion. Every outcome is handled here, so the returned promise never rejects. */
  private async runJob(job: QueueJob): Promise<void> {
    const ctx = { job_id: job.jobId, kind: job.kind, attempt: job.attempts };
    const handler = this.opts.handlers.get(job.kind);
    try {
      if (handler === undefined) throw new Error(`no handler for job kind "${job.kind}"`);
      await handler(job);
    } catch (err) {
      await this.recordFailure(job, err);
      return;
    }
    try {
      await this.opts.rpc.ack(job.jobId, job.msgId);
      this.opts.log.info('job done', ctx);
    } catch (err) {
      // The message becomes visible again after its timeout and the (idempotent) handler re-runs.
      this.opts.log.error('job ack failed', err, ctx);
    }
  }

  private async recordFailure(job: QueueJob, err: unknown): Promise<void> {
    const ctx = { job_id: job.jobId, kind: job.kind, attempt: job.attempts };
    this.opts.log.error('job failed', err, ctx);
    try {
      const outcome = await this.opts.rpc.fail(job.jobId, job.msgId, errorText(err));
      if (outcome === 'dead') {
        this.opts.log.error('job is dead after its last attempt', undefined, { ...ctx, last_error: errorText(err) });
      }
    } catch (failErr) {
      this.opts.log.error('worker_fail_job failed', failErr, ctx);
    }
  }

  private sleep(ms: number): Promise<void> {
    if (this.stopping) return Promise.resolve();
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.wakeSleeper = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakeSleeper = done;
    });
  }
}
