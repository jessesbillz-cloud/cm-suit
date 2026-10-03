// Read one spec section with AI and add its requirements as drafts (migration 0063; prompts/extractRequirements.md).
// The person picks a section of a spec book in the job's Specs folder (its pages' text, file_pages) or pastes the
// section's text; the drafts land in the Requirements tool's Drafts, each with its quoted sentence, for the PE to keep
// or drop one by one. Nothing is kept, sent or changed without that tap (CLAUDE.md rule 12).
//
// Order: requireUser -> requireCapability('requirements.manage') -> the AI key must be set (refuse, never skip) ->
// rate limits (per person and per job) -> the text, read AS THE CALLER (RLS on files / file_pages: a file the caller
// can't see is not found) -> runTask (the text in the user turn as an untrusted block; zod on the answer) ->
// prepareDrafts (quotes checked against the text, money out) -> requirements_add_drafts AS THE CALLER (which skips what
// the job already has).
// Listed in admin_service_key_allowlist.txt: the service client is used only for the rate limit buckets and the
// ai_calls log (neither is granted to users), after the checks above.
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { env } from '../_shared/env.ts';
import { limit } from '../_shared/ratelimit.ts';
import { parseJson } from '../_shared/validate.ts';
import { extractRequirementsTask, runTask } from '../_shared/ai.ts';
import { ExtractBody, MAX_CHARS, pageRangeProblem, pagesText, type PageText, prepareDrafts } from '../_shared/requirements.ts';

interface SpecFile { id: string; project_id: string; scan_status: string; upload_complete: boolean }

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, ExtractBody, MAX_CHARS + 4096);
  await requireCapability(client, body.project_id, 'requirements.manage');
  // A missing key or model refuses the request here, before anything is read or counted (env() throws a 500).
  env('ANTHROPIC_API_KEY');
  env('AI_MODEL_HEAVY');

  const service = serviceClient();
  await limit(service, `requirements-extract:user:${user.id}`, 30, 30 / 3600);
  await limit(service, `requirements-extract:project:${body.project_id}`, 120, 120 / 3600);

  let docText: string;
  let source: string;
  let fileId: string | null = null;
  if (body.source === 'file') {
    const problem = pageRangeProblem(body.first_page, body.last_page);
    if (problem) return refuse(req, 400, 'page_range', problem);
    const file = must(
      await client.from('files').select('id, project_id, scan_status, upload_complete').eq('id', body.file_id).maybeSingle(),
      'file lookup',
    ) as SpecFile | null;
    if (!file || file.project_id !== body.project_id) throw new HttpError(404, 'File not found');
    if (file.scan_status === 'infected') return refuse(req, 409, 'unreadable', 'This file failed the virus scan');
    if (!file.upload_complete) return refuse(req, 409, 'text_not_ready', 'The upload has not finished. Try again in a minute.');
    const pages = must(
      await client.from('file_pages').select('page_no, text').eq('file_id', file.id)
        .gte('page_no', body.first_page).lte('page_no', body.last_page).order('page_no'),
      'file_pages lookup',
    ) as PageText[];
    if (!pages.some((p) => p.text.trim() !== '')) {
      return refuse(req, 409, 'text_not_ready', "This file's text isn't read yet. Paste the section instead.");
    }
    docText = pagesText(pages);
    if (docText.length > MAX_CHARS) return refuse(req, 400, 'too_long', 'Too much text for one section. Pick fewer pages.');
    source = `file:${file.id}#p${body.first_page}-${body.last_page}`;
    fileId = file.id;
  } else {
    docText = body.text;
    source = 'pasted';
  }

  const { output, model } = await runTask(extractRequirementsTask, { documentText: docText, source }, {
    service, projectId: body.project_id, userId: user.id,
  });
  const prepared = prepareDrafts(output, docText);
  const rows = await rpc<{ added: number; skipped: number }[]>(client, 'requirements_add_drafts', {
    p_project_id: body.project_id, p_model: model, p_source_file_id: fileId, p_drafts: prepared.drafts,
  });
  const saved = rows[0];
  if (!saved) throw new HttpError(500, 'requirements_add_drafts answered nothing');
  return ok(req, {
    found: output.requirements.length,
    added: saved.added,
    /** The job has them already (kept, drafts, or dropped before). */
    skipped: saved.skipped + prepared.repeated,
    /** Left out: the quoted sentence is not in the text. */
    unquoted: prepared.unquoted,
    model,
  });
}));
