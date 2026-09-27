import type { QueueJob } from '../queue.js';
import type { WorkerEnv } from '../lib/env.js';
import type { Logger } from '../lib/log.js';
import type { R2Store } from '../lib/r2.js';
import type { Db } from '../lib/supabase.js';

export interface HandlerDeps {
  db: Db;
  r2: R2Store;
  env: WorkerEnv;
  log: Logger;
}

export type KindHandler = (job: QueueJob, deps: HandlerDeps) => Promise<void>;
