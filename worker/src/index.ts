// Worker entry: Sentry, env check, heartbeat, queue loop, graceful shutdown on SIGTERM.
import * as Sentry from '@sentry/node';
import { buildHandlers } from './handlers/index.js';
import { parseEnv, workerVersion } from './lib/env.js';
import { log } from './lib/log.js';
import { SupabaseQueueRpc } from './lib/queueRpc.js';
import { R2Store } from './lib/r2.js';
import { createServiceClient } from './lib/supabase.js';
import { QueueRunner } from './queue.js';

const HEARTBEAT_MS = 30_000;
const FLUSH_MS = 5000;

function initSentry(version: string): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  // The one tolerated missing variable: Sentry is observability, not a security check.
  if (!dsn) {
    log.warn('SENTRY_DSN is not set; errors are only logged');
    return;
  }
  Sentry.init({
    dsn,
    release: version,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  });
}

function startHeartbeat(rpc: SupabaseQueueRpc, version: string): { stop: () => void } {
  const beat = (): void => {
    rpc.heartbeat(version).catch((err: unknown) => {
      log.error('heartbeat failed', err);
    });
  };
  beat();
  const timer = setInterval(beat, HEARTBEAT_MS);
  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}

async function main(): Promise<number> {
  const version = workerVersion(process.env);
  initSentry(version);

  const parsed = parseEnv(process.env);
  if (!parsed.ok) {
    log.error(`worker cannot start; fix these environment variables: ${parsed.problems.join(', ')}`);
    return 1;
  }
  const { env } = parsed;

  const db = createServiceClient(env);
  const rpc = new SupabaseQueueRpc(db);
  const runner = new QueueRunner({ rpc, handlers: buildHandlers({ db, r2: new R2Store(env), env, log }), log });

  const onSignal = (signal: NodeJS.Signals): void => {
    log.info('shutdown requested; finishing jobs in flight', { signal });
    runner.stop();
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
  process.on('unhandledRejection', (reason) => {
    log.error('unhandled promise rejection', reason);
  });

  log.info('worker started', { version });
  const heartbeat = startHeartbeat(rpc, version);
  await runner.run();
  heartbeat.stop();
  log.info('worker stopped');
  return 0;
}

main()
  .catch((err: unknown) => {
    log.error('worker crashed', err);
    return 1;
  })
  .then(async (code) => {
    await Sentry.close(FLUSH_MS);
    process.exit(code);
  })
  .catch((err: unknown) => {
    log.error('worker exit failed', err);
    process.exit(1);
  });
