// render_pdf {kind, entity_type, entity_id, content_hash}: official (signed/legal) PDF renders (SPEC §8.2, §6.9).
// Phase 0 stub. In Phase 3 this renders with the pure builders from the app's src/lib/pdf/ and binds the stored
// PDF to content_hash (re-render when the saved content no longer matches).
// TODO(Phase 3): import the builders and the ONE signature stamp (src/lib/pdf/stamp.ts) through a shared package.
// Do not write a second stamp in the worker (CLAUDE.md rule 11).
import { z } from 'zod';
import type { QueueJob } from '../queue.js';

const payloadSchema = z.object({
  kind: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: z.string().uuid(),
  content_hash: z.string().min(1),
});

export function renderPdf(job: QueueJob): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload);
  if (!parsed.success) return Promise.reject(new Error(`render_pdf: invalid payload: ${parsed.error.message}`));
  return Promise.reject(new Error('render_pdf is not implemented until Phase 3'));
}
