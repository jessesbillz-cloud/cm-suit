// render_pdf {kind, entity_type, entity_id, content_hash}: official (signed/legal) PDF renders (SPEC §8.2, §6.9).
// Stub. No worker host runs today, so official PDFs are rendered by edge functions with the builders and the ONE
// signature stamp in supabase/functions/_shared/pdf/ (docs/decisions.md). If the worker is hosted later it imports
// those same files; do not write a second stamp here (CLAUDE.md rule 11).
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
