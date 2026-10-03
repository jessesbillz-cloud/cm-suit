// Safety meetings (migration 0060): the sign-in sheet PDF, and a library topic's PDF. Signed-in users only; every action
// runs as the caller first.
//   close:      requireUser -> safety_meeting_close AS THE CALLER (the leader or a safety manager; the version check; the
//               QR stops, a tailgate completes the job's reminders) -> render below. When the PDF fails after the close,
//               the meeting stays closed and the screen offers Make PDF (render).
//   render:     requireUser -> safety_meeting_sheet AS THE CALLER (safety.read; closed meetings only) -> ensureSheet
//               (_shared/safetySheet.ts, the one way: the sheet on file when it already shows exactly this, else built
//               from the saved content, stored in the job's Safety folder as the previous sheet's next version and
//               recorded by safety_meeting_attach) -> { file_id }. Downloading it is the one download path (`download`).
//   topic_file: safety_topic_file AS THE CALLER (safety.read on this job; a topic of the job's company or a starter; the
//               scan rules; logged as a download) -> a fresh signed URL with the original filename.
// Closing is the record (Jesse, Oct 3): the sheet is not signed through SignButton; the leader's name, the close time and
// the content hash are on it. Service client (admin_service_key_allowlist.txt): the Safety folder, storing and recording
// the sheet, signing the topic's URL; each only after the caller-run RPC above.
import { handle, HttpError, ok } from '../_shared/http.ts';
import { rpc, serviceClient, signedDownloadUrl } from '../_shared/db.ts';
import { requireUser } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { ensureSheet, sheetFactsSchema } from '../_shared/safetySheet.ts';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('close'), meeting_id: uuid, version: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal('render'), meeting_id: uuid }).strict(),
  z.object({ action: z.literal('topic_file'), project_id: uuid, topic_id: uuid }).strict(),
]);

interface Authorized {
  storage_path: string;
  original_name: string;
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);

  if (body.action === 'topic_file') {
    const rows = await rpc<Authorized[]>(client, 'safety_topic_file', { p_project_id: body.project_id, p_topic_id: body.topic_id });
    const f = rows?.[0];
    if (!f) throw new HttpError(404, 'File not found');
    const url = await signedDownloadUrl(serviceClient(), 'files', f.storage_path, f.original_name);
    return ok(req, { url, filename: f.original_name });
  }

  if (body.action === 'close') {
    await rpc<number>(client, 'safety_meeting_close', { p_meeting_id: body.meeting_id, p_version: body.version });
  }
  const facts = sheetFactsSchema.parse(await rpc<unknown>(client, 'safety_meeting_sheet', { p_meeting_id: body.meeting_id }));
  const fileId = await ensureSheet(serviceClient(), facts, user.id);
  return ok(req, { file_id: fileId });
}));
