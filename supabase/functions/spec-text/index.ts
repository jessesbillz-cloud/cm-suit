// Cron (0118): the spec book as text. Called by pg_cron (spec_text_cron, every minute while a book waits) and by its own
// end when more waits, with `x-cron-secret`. One book a call, one step a call, so a call stays inside the platform's
// CPU time:
//   * the book's text is not done: read the next pages' text layer from the PDF in private storage (pdf.js, the lines
//     as the viewer reads them) and store them (spec_text_pages_put). The last page marks the text done, which finds
//     the sections (0088). A book with no text at all is marked none (a scan: no OCR here).
//   * the text is done: parse the sections whose pages changed (spec_text_todo, _shared/specText.ts) and save them.
// A failure is recorded and tried again on a later call, five tries in all. Never in a browser.
// Service role: cron job. The queue and its steps are the server's alone.
import { getDocumentProxy } from 'unpdf';
import { handle, HttpError, ok } from '../_shared/http.ts';
import { type Db, rpc, serviceClient } from '../_shared/db.ts';
import { requireCron } from '../_shared/auth.ts';
import { parseSection, runningSet, SPEC_PARSER, type RunningLines } from '../_shared/specText.ts';

interface Claimed {
  file_id: string;
  project_id: string;
  storage_path: string;
  size: number;
  text_done: boolean;
  page_count: number | null;
  next_page: number;
}

interface Todo {
  spec_section_id: string;
  section: string;
  title: string;
  first_page: number;
  last_page: number;
  source_hash: string;
  pages: { page: number; text: string }[];
}

/** Larger books are not read here (the function's memory): the reader shows their pages. */
const MAX_BYTES = 100 * 1024 * 1024;
/** Time spent reading pages or parsing sections in one call, well inside the CPU limit with the PDF's own load. */
const STEP_MS = 900;
const MAX_PAGES_A_CALL = 400;
const TODO_BATCH = 20;

class TooBig extends Error {}

type Pdf = Awaited<ReturnType<typeof getDocumentProxy>>;

/** One page's text: each text item, a new line where pdf.js ends one (the same lines the viewer's text has). */
async function pageText(pdf: Pdf, n: number): Promise<string> {
  const page = await pdf.getPage(n);
  const content = await page.getTextContent();
  let out = '';
  for (const item of content.items) {
    if (!('str' in item)) continue;
    out += item.str;
    if (item.hasEOL) out += '\n';
  }
  page.cleanup();
  // Postgres text cannot hold NUL.
  return out.split(String.fromCharCode(0)).join('');
}

async function readPages(service: Db, c: Claimed): Promise<string> {
  if (c.size > MAX_BYTES) throw new TooBig(`The book is over ${String(MAX_BYTES / 1024 / 1024)} MB: not read here.`);
  const { data, error } = await service.storage.from('files').download(c.storage_path);
  if (error || !data) throw new HttpError(500, `storage download: ${error?.message ?? 'no data'}`);
  const pdf = await getDocumentProxy(new Uint8Array(await data.arrayBuffer()));
  const count = pdf.numPages;
  const pages: { page: number; text: string }[] = [];
  const started = performance.now();
  let n = Math.max(1, c.next_page);
  while (n <= count && pages.length < MAX_PAGES_A_CALL && (pages.length === 0 || performance.now() - started < STEP_MS)) {
    pages.push({ page: n, text: await pageText(pdf, n) });
    n += 1;
  }
  await pdf.destroy();
  return await rpc<string>(service, 'spec_text_pages_put', { p_file_id: c.file_id, p_page_count: count, p_pages: pages, p_next: n });
}

/** Parses sections until none waits ('done') or the step's time is up ('more'). */
async function parseSome(service: Db, fileId: string): Promise<'done' | 'more'> {
  const running = runningSet(await rpc<RunningLines>(service, 'spec_text_running', { p_file_id: fileId }));
  const started = performance.now();
  while (performance.now() - started < STEP_MS) {
    const todo = await rpc<Todo[]>(service, 'spec_text_todo', { p_file_id: fileId, p_parser: SPEC_PARSER, p_limit: TODO_BATCH });
    if (todo.length === 0) return 'done';
    const items = todo.map((t) => {
      const parsed = parseSection({ section: t.section, title: t.title, pages: t.pages }, running);
      return { spec_section_id: t.spec_section_id, source_hash: t.source_hash, parser: SPEC_PARSER, status: parsed.status, body: parsed.body };
    });
    const saved = await rpc<number>(service, 'spec_text_save', { p_file_id: fileId, p_items: items });
    if (saved !== items.length) throw new Error(`spec_text_save kept ${String(saved)} of ${String(items.length)} sections`);
  }
  return 'more';
}

Deno.serve(handle(async (req) => {
  await requireCron(req);
  const service = serviceClient();
  const [c] = await rpc<Claimed[]>(service, 'spec_text_claim');
  if (!c) return ok(req, { book: null });
  let step: string;
  try {
    if (c.text_done) {
      step = await parseSome(service, c.file_id);
      await rpc(service, 'spec_text_end', { p_file_id: c.file_id, p_status: step === 'done' ? 'done' : 'queued', p_error: null });
    } else {
      // spec_text_pages_put queues the book again (more pages, or its sections to parse) or ends it (no text).
      step = await readPages(service, c);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[spec-text] ${c.file_id}: ${message}`);
    await rpc(service, 'spec_text_end', { p_file_id: c.file_id, p_status: e instanceof TooBig ? 'failed' : 'queued', p_error: message });
    await rpc(service, 'spec_text_cron');
    throw e;
  }
  // Goes on at once while anything waits (this book's next step or another book).
  const waiting = await rpc<number>(service, 'spec_text_cron');
  return ok(req, { book: c.file_id, step, waiting });
}));
