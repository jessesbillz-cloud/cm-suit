// One tap for a whole batch at each approval step (migration 0114; Jesse, Oct 23: speed and zero wasted taps). A batch
// sent from the request being built (0113) is read as one line, with the step I take on it (gc, ready or send: the
// earliest with requests waiting on me) and every request of it, each saying whether it waits on me. The step for the
// batch carries the version of each request that waits on me; the database calls the single button's own function for
// each, all or nothing, and skips what is past the step. Every answer is parsed with zod.
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/irBatch';

const stepSchema = z.enum(['gc', 'ready', 'send']);
export type BatchStep = z.infer<typeof stepSchema>;

const batchSchema = z.object({
  batch_id: z.string(),
  project_id: z.string(),
  size: z.number().int(),
  /** "Level 01 · Top of wall & HOW Spray" */
  items: z.string(),
  /** The step I take on it now, or null when none of it waits on me. */
  step: stepSchema.nullable(),
  requests: z.array(
    z.object({
      id: z.string(),
      number: z.number().int(),
      ofs_number: z.number().int().nullable(),
      items: z.string(),
      status: z.string(),
      result: z.string().nullable(),
      helper_id: z.string().nullable(),
      ofs_sent_at: z.string().nullable(),
      version: z.number().int(),
      /** Waits on me at `step`. */
      waits: z.boolean(),
    }),
  ),
});
export type IrBatch = z.infer<typeof batchSchema>;
type IrBatchRequest = IrBatch['requests'][number];

const stepAnswerSchema = z.object({
  batch_id: z.string(),
  step: stepSchema,
  done: z.array(z.object({ id: z.string(), number: z.number().int(), ofs_number: z.number().int().nullable(), status: z.string(), version: z.number().int() })),
  skipped: z.array(z.string()),
});
export type BatchStepAnswer = z.infer<typeof stepAnswerSchema>;

async function fetchBatch(batchId: string): Promise<IrBatch> {
  if (isMock()) return mock.get(batchId);
  return batchSchema.parse(throwIfError(await supabase.rpc('ir_batch_get', { p_batch_id: batchId })));
}

/** One batch, as I read it (a request page of a request filed in one). */
export function useIrBatch(projectId: string, batchId: string | null) {
  return useQuery({
    queryKey: qk.inspectionsPart(projectId, 'batch', batchId ?? ''),
    queryFn: batchId ? () => fetchBatch(batchId) : skipToken,
  });
}

async function fetchWaiting(projectId: string | null): Promise<IrBatch[]> {
  if (isMock()) return mock.waiting(projectId);
  const raw = throwIfError(await supabase.rpc('ir_batches_waiting', projectId === null ? {} : { p_project_id: projectId }));
  return z.array(batchSchema).parse(raw);
}

/** The batches with requests waiting on me, on a job (null: all my jobs). */
export function useIrBatchesWaiting(projectId: string | null) {
  return useQuery({
    queryKey: qk.inspectionsPart(projectId ?? 'all', 'batches-waiting'),
    queryFn: () => fetchWaiting(projectId),
  });
}

/** The waiting ones of a batch, as the step for the batch carries them. */
export function waitingOf(batch: IrBatch): IrBatchRequest[] {
  return batch.requests.filter((r) => r.waits);
}

async function runStep(batch: IrBatch): Promise<BatchStepAnswer> {
  if (batch.step === null) throw new Error('Nothing in this batch waits on you.');
  const versions = Object.fromEntries(waitingOf(batch).map((r) => [r.id, r.version]));
  if (isMock()) return mock.step(batch.batch_id, batch.step, versions);
  const raw = throwIfError(await supabase.rpc('ir_batch_step', { p_batch_id: batch.batch_id, p_step: batch.step, p_versions: versions }));
  return stepAnswerSchema.parse(raw);
}

/** The step I take on the whole batch (Ready all, Send all to OFS), then every view of its requests refreshes. */
export function useIrBatchStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runStep,
    onSettled: (_a, _e, batch) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.inspections(batch.project_id) }),
        qc.invalidateQueries({ queryKey: qk.inspections('all') }),
        qc.invalidateQueries({ queryKey: qk.ofsPart('desk', batch.project_id) }),
        qc.invalidateQueries({ queryKey: qk.revs(batch.project_id) }),
        qc.invalidateQueries({ queryKey: qk.board(batch.project_id) }),
        qc.invalidateQueries({ queryKey: ['ir_batches'] }),
      ]),
  });
}
