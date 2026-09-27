// Job kind → handler. Kinds are rows in public.job_kinds; a kind without a handler here fails loudly.
import type { JobHandler } from '../queue.js';
import { buildZip } from './build_zip.js';
import { extractText } from './extract_text.js';
import { r2Copy } from './r2_copy.js';
import { renderPdf } from './render_pdf.js';
import { scanFile } from './scan_file.js';
import { sendEmail } from './send_email.js';
import { sortInboundEmail } from './sort_inbound_email.js';
import { thumbnails } from './thumbnails.js';
import type { HandlerDeps, KindHandler } from './types.js';

const HANDLERS: ReadonlyArray<readonly [string, KindHandler]> = [
  ['scan_file', scanFile],
  ['extract_text', extractText],
  ['thumbnails', thumbnails],
  ['render_pdf', renderPdf],
  ['build_zip', buildZip],
  ['r2_copy', r2Copy],
  ['send_email', sendEmail],
  ['sort_inbound_email', sortInboundEmail],
];

export function buildHandlers(deps: HandlerDeps): ReadonlyMap<string, JobHandler> {
  const handlers = new Map<string, JobHandler>();
  for (const [kind, handler] of HANDLERS) handlers.set(kind, (job) => handler(job, deps));
  return handlers;
}
