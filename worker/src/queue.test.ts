import { describe, expect, it } from 'vitest';
import { idleDelayMs, QueueRunner, type JobHandler, type QueueJob, type QueueRpc } from './queue.js';
import { errorText } from './lib/errorText.js';
import type { Logger } from './lib/log.js';

function job(jobId: string, kind: string): QueueJob {
  return { jobId, msgId: 1, kind, projectId: null, payload: {}, attempts: 1 };
}

class FakeRpc implements QueueRpc {
  readonly limits: number[] = [];
  readonly acked: string[] = [];
  readonly failed: { jobId: string; error: string }[] = [];
  outcome: 'retry' | 'dead' = 'retry';

  constructor(private readonly batches: QueueJob[][]) {}

  readJobs(limit: number): Promise<QueueJob[]> {
    this.limits.push(limit);
    return Promise.resolve((this.batches.shift() ?? []).slice(0, limit));
  }
  ack(jobId: string): Promise<void> {
    this.acked.push(jobId);
    return Promise.resolve();
  }
  fail(jobId: string, _msgId: number, error: string): Promise<'retry' | 'dead'> {
    this.failed.push({ jobId, error });
    return Promise.resolve(this.outcome);
  }
}

class FakeLog implements Logger {
  readonly errors: string[] = [];
  info(): void {
    return undefined;
  }
  warn(): void {
    return undefined;
  }
  error(msg: string): void {
    this.errors.push(msg);
  }
}

function runner(rpc: QueueRpc, handlers: Record<string, JobHandler>, log = new FakeLog()): QueueRunner {
  return new QueueRunner({ rpc, handlers: new Map(Object.entries(handlers)), log });
}

describe('QueueRunner dispatch', () => {
  it('runs the handler for each kind and acks successes', async () => {
    const seen: string[] = [];
    const rpc = new FakeRpc([[job('a', 'one'), job('b', 'two')]]);
    const r = runner(rpc, {
      one: (j) => Promise.resolve(void seen.push(`one:${j.jobId}`)),
      two: (j) => Promise.resolve(void seen.push(`two:${j.jobId}`)),
    });
    expect(await r.pollOnce()).toBe(2);
    await r.drain();
    expect(seen.sort()).toEqual(['one:a', 'two:b']);
    expect(rpc.acked.sort()).toEqual(['a', 'b']);
    expect([...rpc.failed].sort((x, y) => x.jobId.localeCompare(y.jobId))).toEqual([]);
  });

  it('fails a throwing job and an unknown kind without stopping the others', async () => {
    const rpc = new FakeRpc([[job('bad', 'boom'), job('ok', 'fine'), job('lost', 'nope')]]);
    const log = new FakeLog();
    const r = runner(rpc, { boom: () => Promise.reject(new Error('kaboom')), fine: () => Promise.resolve() }, log);
    await r.pollOnce();
    await r.drain();
    expect(rpc.acked).toEqual(['ok']);
    expect([...rpc.failed].sort((x, y) => x.jobId.localeCompare(y.jobId))).toEqual([
      { jobId: 'bad', error: 'kaboom' },
      { jobId: 'lost', error: 'no handler for job kind "nope"' },
    ]);
    expect(log.errors).toContain('job failed');
  });

  it('logs an error when the job is dead', async () => {
    const rpc = new FakeRpc([[job('x', 'boom')]]);
    rpc.outcome = 'dead';
    const log = new FakeLog();
    const r = runner(rpc, { boom: () => Promise.reject(new Error('no')) }, log);
    await r.pollOnce();
    await r.drain();
    expect(log.errors).toContain('job is dead after its last attempt');
  });

  it('reads no more jobs than free slots (max 3 running)', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rpc = new FakeRpc([[job('1', 'slow'), job('2', 'slow'), job('3', 'slow')], [job('4', 'slow')]]);
    const r = runner(rpc, { slow: () => gate });
    expect(await r.pollOnce()).toBe(3);
    expect(await r.pollOnce()).toBe(0);
    expect(rpc.limits).toEqual([3]);
    release();
    await r.drain();
    expect(rpc.acked).toHaveLength(3);
  });

  it('stops promptly while idle', async () => {
    const r = runner(new FakeRpc([]), {});
    const done = r.run();
    r.stop();
    await expect(done).resolves.toBeUndefined();
  });
});

describe('backoff and error text', () => {
  it('backs off 2s, 4s, 8s, then holds at 10s', () => {
    expect([0, 1, 2, 3, 4, 20].map(idleDelayMs)).toEqual([2000, 2000, 4000, 8000, 10_000, 10_000]);
  });

  it('caps stored error text at 2000 characters', () => {
    expect(errorText(new Error('x'.repeat(5000)))).toHaveLength(2000);
    expect(errorText('plain')).toBe('plain');
  });
});
