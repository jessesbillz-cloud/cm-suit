// One-click download with the original filename (SPEC §6.5, §8.1). Signed-in members only.
//
// Authorization and logging happen in authorize_download(), called with the USER client so it sees auth.uid(): it
// checks folder access, view-only, scan status, then writes the downloads row and the audit event.
// The service client is used for one thing only: signing the URL, because users have no storage SELECT policy
// (downloads always go through this gate). Listed in admin_service_key_allowlist.txt for that reason.
import { handle, HttpError, ok } from '../_shared/http.ts';
import { rpc, serviceClient, signedDownloadUrl } from '../_shared/db.ts';
import { requireUser } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';

const Body = z.object({
  file_id: uuid,
  // Stamped copies (SPEC §6.5 [confirm]) are built by the worker in a later phase; only originals exist now.
  variant: z.literal('original').default('original'),
}).strict();

interface Authorized {
  storage_path: string;
  original_name: string;
  mime: string;
}

Deno.serve(handle(async (req) => {
  const { client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);

  const rows = await rpc<Authorized[]>(client, 'authorize_download', { p_file_id: body.file_id, p_variant: body.variant });
  const f = rows?.[0];
  if (!f) throw new HttpError(404, 'File not found');

  const url = await signedDownloadUrl(serviceClient(), 'files', f.storage_path, f.original_name);
  return ok(req, { url, filename: f.original_name, mime: f.mime });
}));
