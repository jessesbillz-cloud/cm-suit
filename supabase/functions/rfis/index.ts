// RFIs (SPEC §14.1, §6.9): the two signatures, the PDF and an RFI's own downloads. Signed-in users only; every action
// runs as the caller first.
//   send:     "Sign & send". requireUser → load the RFI AS THE CALLER (RLS; unseen = 404) → its originator, a draft, the
//             version the person saw → requireCapability('rfi.create_draft') → a fresh sign-in (signingConfirmed) else
//             403 reauth_required → rfiHash of the saved content → rfi_sign_send() as the caller (version check, stamps
//             sent_at/by + hash, audit, the RFI's route, tasks, board) → the stored hash must match.
//   issue:    "Sign & issue". The same for rfi.sign_issue and rfi_sign_issue() (the number comes from the database
//             there), then the official PDF: rendered, stored (the next version of the RFI's PDF) and recorded
//             (rfi_attach_pdf, service role only, so the PDF on an RFI is always one this function made).
//   pdf:      the RFI as it is now (DRAFT before issue). Rendered and stored again only when something it shows changed
//             (its key, rfis.pdf_hash; answering changes it), else the stored one. A fresh signed URL either way.
//   view:     the same PDF for "Full screen": a fresh signed URL without the download header, so the browser's own
//             viewer shows it and pages through it. Only the RFI's own server-made PDF, through the same gate (logged).
//   download: a photo, answer file or the PDF of that RFI: rfi_authorize_file() as the caller (who may see the RFI,
//             the scan rules, logs the download), then a fresh signed URL.
// Service client (admin_service_key_allowlist.txt): storing and recording the PDF, reading photo, logo and signature
// bytes from private storage, and signing download URLs; each only after the caller-run checks above.
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, signedDownloadUrl, storageError } from '../_shared/db.ts';
import { requireCapability, requireUser, signingConfirmed } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { storeGeneratedPdf } from '../_shared/generatedPdf.ts';
import { buildRfiPdf } from '../_shared/pdf/rfi.ts';
import { pdfSafe } from '../_shared/pdf/inspectionReport.ts';
import { stampSignature } from '../_shared/pdf/stamp.ts';
import {
  loadRfi, loadRfiDetail, parseRfi, type RfiFileRef, rfiHash, type RfiJob, type RfiPdfPlan, rfiPdfKey, rfiPdfPlan,
} from '../_shared/rfis.ts';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), rfi_id: uuid, version: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('issue'), rfi_id: uuid, version: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('pdf'), rfi_id: uuid }).strict(),
  z.object({ action: z.literal('view'), rfi_id: uuid }).strict(),
  z.object({ action: z.literal('download'), rfi_id: uuid, file_id: uuid }).strict(),
]);

type Row = Record<string, unknown>;
interface Authorized {
  storage_path: string;
  original_name: string;
  mime: string;
}

async function jobOf(client: Db, projectId: string): Promise<RfiJob> {
  const p = must(
    await client.from('projects').select('name, number, address, timezone, org_id').eq('id', projectId).single(),
    'project lookup',
  ) as { name: string; number: string | null; address: string | null; timezone: string; org_id: string };
  const o = must(await client.from('orgs').select('name, logo_path').eq('id', p.org_id).single(), 'company lookup') as
    { name: string; logo_path: string | null };
  return { name: p.name, number: p.number, address: p.address, timezone: p.timezone, orgName: o.name, logoPath: o.logo_path };
}

async function bytesOf(service: Db, bucket: string, path: string, what: string): Promise<Uint8Array> {
  const { data, error } = await service.storage.from(bucket).download(path);
  if (error || !data) throw storageError(error ?? { message: 'no data' }, what);
  return new Uint8Array(await data.arrayBuffer());
}

/** The photos' rows read as the caller (RLS on files), then their bytes through the service client. */
async function photoBytes(client: Db, service: Db, projectId: string, refs: RfiFileRef[]): Promise<Uint8Array[]> {
  if (refs.length === 0) return [];
  const rows = must(
    await client.from('files').select('id, storage_path').eq('project_id', projectId).in('id', refs.map((r) => r.id))
      .is('deleted_at', null),
    'photo lookup',
  ) as { id: string; storage_path: string }[];
  const byId = new Map(rows.map((r) => [r.id, r.storage_path]));
  const out: Uint8Array[] = [];
  for (const ref of refs) {
    const path = byId.get(ref.id);
    if (!path) throw new HttpError(409, 'A photo is missing. Remove it and add it again.');
    out.push(await bytesOf(service, 'files', path, 'photo download'));
  }
  return out;
}

function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

/** A signer's signature image (their profile's, in the private signatures bucket). The stamp takes PNG only; without
 *  one it prints the name and time alone. */
async function signatureOf(service: Db, signerId: string): Promise<Uint8Array | null> {
  const p = must(await service.from('profiles').select('signature_path').eq('user_id', signerId).maybeSingle(), 'signature lookup') as
    { signature_path: string | null } | null;
  if (!p?.signature_path) return null;
  const png = await bytesOf(service, 'signatures', p.signature_path, 'signature download');
  return isPng(png) ? png : null;
}

async function render(client: Db, service: Db, plan: RfiPdfPlan, projectId: string): Promise<Uint8Array> {
  const logo = plan.logoPath ? await bytesOf(service, 'org-logos', plan.logoPath, 'logo download') : null;
  const photos = await photoBytes(client, service, projectId, plan.photos);
  let bytes = await buildRfiPdf({ ...plan.text, logo, photos });
  for (const s of plan.stamps) {
    bytes = await stampSignature(bytes, {
      signaturePng: await signatureOf(service, s.signerId), name: pdfSafe(s.name), signedAtLabel: s.signedAtLabel, align: s.align,
    });
  }
  return bytes;
}

/** The job's RFIs folder: read as the caller, or made by rfi_folder (people who write RFIs or answers). */
async function folderOf(client: Db, projectId: string): Promise<string> {
  const f = must(
    await client.from('folders').select('id').eq('project_id', projectId).eq('kind', 'rfis').is('deleted_at', null).limit(1)
      .maybeSingle(),
    'folder lookup',
  ) as { id: string } | null;
  return f?.id ?? await rpc<string>(client, 'rfi_folder', { p_project_id: projectId });
}

/** The RFI's PDF as it is now: the stored one when its key still matches (and the file is there), else a new version. */
async function ensurePdf(client: Db, userId: string, rfiId: string): Promise<{ fileId: string; rfi: Row }> {
  const detail = await loadRfiDetail(client, rfiId);
  const r = detail.rfi;
  const plan = rfiPdfPlan(detail, await jobOf(client, r.project_id));
  const key = await rfiPdfKey(plan);
  if (r.pdf_file_id !== null && r.pdf_hash === key) {
    const stored = must(await client.from('files').select('id').eq('id', r.pdf_file_id).is('deleted_at', null).maybeSingle(),
      'pdf lookup') as { id: string } | null;
    if (stored) return { fileId: stored.id, rfi: detail.raw };
  }
  const service = serviceClient();
  const bytes = await render(client, service, plan, r.project_id);
  const folderId = await folderOf(client, r.project_id);
  const stored = await storeGeneratedPdf(service, {
    projectId: r.project_id, folderId, name: plan.filename, bytes, createdBy: userId, replaces: r.pdf_file_id,
  });
  const rfi = await rpc<Row>(service, 'rfi_attach_pdf', { p_rfi_id: r.id, p_file_id: stored.id, p_content_hash: key });
  return { fileId: stored.id, rfi };
}

/** A short-lived URL the browser shows instead of saving (no download header): the RFI's own PDF only. */
async function signedViewUrl(service: Db, path: string): Promise<string> {
  const { data, error } = await service.storage.from('files').createSignedUrl(path, 600);
  if (error || !data) throw storageError(error ?? { message: 'no signed url' }, 'createSignedUrl');
  return data.signedUrl;
}

async function authorized(client: Db, rfiId: string, fileId: string): Promise<Authorized> {
  const rows = await rpc<Authorized[]>(client, 'rfi_authorize_file', { p_rfi_id: rfiId, p_file_id: fileId });
  const f = rows?.[0];
  if (!f) throw new HttpError(404, 'File not found');
  return f;
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);

  if (body.action === 'download') {
    const f = await authorized(client, body.rfi_id, body.file_id);
    const url = await signedDownloadUrl(serviceClient(), 'files', f.storage_path, f.original_name);
    return ok(req, { url, filename: f.original_name, mime: f.mime });
  }

  if (body.action === 'pdf') {
    const pdf = await ensurePdf(client, user.id, body.rfi_id);
    const f = await authorized(client, body.rfi_id, pdf.fileId);
    const url = await signedDownloadUrl(serviceClient(), 'files', f.storage_path, f.original_name);
    return ok(req, { url, filename: f.original_name });
  }

  if (body.action === 'view') {
    const pdf = await ensurePdf(client, user.id, body.rfi_id);
    const f = await authorized(client, body.rfi_id, pdf.fileId);
    if (f.mime !== 'application/pdf') throw new HttpError(409, 'The PDF is missing. Try again.');
    return ok(req, { url: await signedViewUrl(serviceClient(), f.storage_path) });
  }

  const row = await loadRfi(client, body.rfi_id);
  if (body.action === 'send') {
    if (row.created_by !== user.id) throw new HttpError(403, 'Only the person who wrote it signs and sends it.');
    await requireCapability(client, row.project_id, 'rfi.create_draft');
    if (row.status !== 'draft') throw new HttpError(409, 'This RFI was already sent.');
  } else {
    await requireCapability(client, row.project_id, 'rfi.sign_issue');
    if (row.status !== 'issue') throw new HttpError(409, 'This RFI is not ready to issue.');
  }
  if (row.version !== body.version) throw new HttpError(409, 'The RFI changed. Reload and try again.');
  if (!(await signingConfirmed(client, user, req))) return refuse(req, 403, 'reauth_required', 'Confirm it is you to sign this RFI');

  const hash = await rfiHash(row);
  const fn = body.action === 'send' ? 'rfi_sign_send' : 'rfi_sign_issue';
  const signed = await rpc<Row>(client, fn, { p_rfi_id: row.id, p_version: row.version, p_content_hash: hash });
  const after = parseRfi(signed);
  const stamped = body.action === 'send' ? after.sent_hash : after.issued_hash;
  if (stamped !== hash || (await rfiHash(after)) !== hash) {
    throw new HttpError(500, `RFI ${row.id}: the stored signature does not match the content that was hashed`);
  }
  if (body.action === 'send') return ok(req, { rfi: signed });

  // Issued: the official PDF, bound to what it shows (its key), with both signatures.
  const pdf = await ensurePdf(client, user.id, row.id);
  return ok(req, { rfi: pdf.rfi, pdf_file_id: pdf.fileId });
}));
