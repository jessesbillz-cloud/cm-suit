// One-click download with the original filename (SPEC §6.5, §8.1), and photo previews. Signed-in members only.
//
// Download: authorize_download(), called with the USER client so it sees auth.uid(), checks folder access, view-only
// and the scan status, then writes the downloads row and the audit event.
// Preview (action 'preview'): authorize_preview() as the user asks the same gate (the file's folder, or the RFI or
// inspection request it is opened through), is not a download (no download line; it writes a 'file.preview' audit
// line, 0054), and answers only for images. The image is checked again here before signing, and the URL lives
// PREVIEW_TTL_SECONDS (10 minutes, like a download's).
// The service client is used for one thing only: signing the URL, because users have no storage SELECT policy
// (every URL goes through these gates). Listed in admin_service_key_allowlist.txt for that reason.
import { handle, HttpError, ok } from '../_shared/http.ts';
import { rpc, serviceClient, signedDownloadUrl, signedPreviewUrl } from '../_shared/db.ts';
import { requireUser } from '../_shared/auth.ts';
import { isPreviewImage, PREVIEW_TTL_SECONDS } from '../_shared/images.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';

const Download = z.object({
  file_id: uuid,
  // Stamped copies (SPEC §6.5 [confirm]) are built by the worker in a later phase; only originals exist now.
  variant: z.literal('original').default('original'),
}).strict();

const Preview = z.object({
  action: z.literal('preview'),
  file_id: uuid,
  // Opened through an RFI or an inspection request (their own gates); neither = the file's folder.
  rfi_id: uuid.optional(),
  request_id: uuid.optional(),
}).strict().refine((b) => !(b.rfi_id && b.request_id), 'An RFI or a request, not both');

const Body = z.union([Download, Preview]);

interface Authorized {
  storage_path: string;
  original_name: string;
  mime: string;
}

Deno.serve(handle(async (req) => {
  const { client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);

  if ('action' in body) {
    const rows = await rpc<Authorized[]>(client, 'authorize_preview', {
      p_file_id: body.file_id,
      p_rfi_id: body.rfi_id ?? null,
      p_request_id: body.request_id ?? null,
    });
    const f = rows?.[0];
    if (!f) throw new HttpError(404, 'File not found');
    if (!isPreviewImage(f.mime, f.original_name)) throw new HttpError(403, 'not_image');
    const url = await signedPreviewUrl(serviceClient(), 'files', f.storage_path, PREVIEW_TTL_SECONDS);
    return ok(req, { url });
  }

  const rows = await rpc<Authorized[]>(client, 'authorize_download', { p_file_id: body.file_id, p_variant: body.variant });
  const f = rows?.[0];
  if (!f) throw new HttpError(404, 'File not found');

  const url = await signedDownloadUrl(serviceClient(), 'files', f.storage_path, f.original_name);
  return ok(req, { url, filename: f.original_name, mime: f.mime });
}));
