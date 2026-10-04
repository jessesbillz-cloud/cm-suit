// The IR PDF (SPEC §6.9, §13.2, §18.4 P1). Signed-in users only; every action runs as the caller first.
// Who signs: whoever decides THIS request now (_shared/inspections.ts decideCapability, the database's ir_decide_cap):
// the holder of ir.ofs_decide on an OFS request the inspector has sent to OFS, the holder of ir.decide on every other
// request. An OFS request not sent yet has no IR: the inspector only routes it (400 "Send it to OFS first.").
//   generate: Generate IR / Update PDF. requireUser → load the request AS THE CALLER (RLS; unseen = 404) →
//             requireCapability(decideCapability(row)) → a fresh sign-in (signedInRecently) else 403 reauth_required →
//             contentHash of the saved content → ir_sign() as the caller (owner and version check, stamps
//             signed_at/by + hash, audit) → render (pdf-lib builder + the one stamp) → the request's folder, asked AS
//             THE CALLER (ir_folder; reportFolder: an OFS IR in "OFS inspection reports", every other IR in
//             "Inspection reports", never the other way) → storeGeneratedPdf (the next version when a PDF exists) →
//             ir_attach_pdf() (service role only, so the IR on file is always one the server made): the request is
//             complete.
//   restamp:  after a postpone or a re-confirm, the same signed content re-rendered with or without the POSTPONED
//             mark, same signed time, next version, same folder rule. Only its signer, while they still decide it. No
//             new signature: the hash proves the content is unchanged.
//   download: "View IR" and a request's own files. authorize_ir_file() as the caller (who may see the request, scan
//             rules, logs the download), then a fresh signed URL.
// Service client (admin_service_key_allowlist.txt): storing the PDF (storage + files row) and recording it
// (ir_attach_pdf), reading the result photos' bytes and signing download URLs; each only after the caller-run checks.
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, signedDownloadUrl, storageError } from '../_shared/db.ts';
import { requireCapability, requireUser, signingConfirmed } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { storeGeneratedPdf } from '../_shared/generatedPdf.ts';
import { buildInspectionReport } from '../_shared/pdf/inspectionReport.ts';
import { stampSignature } from '../_shared/pdf/stamp.ts';
import {
  dayLabel, decideCapability, durationLabel, irHash, type IrRow, loadRequest, postponeLabel, reportFolder, resultLabel,
  signedAtLabel, timeLabel, typeLabel,
} from '../_shared/inspections.ts';

/** The filename is built in the app with lib/buildFilename; here it only has to be a safe PDF name. */
const filename = z.string().trim().regex(/^[^/\\:*?"<>|]{1,196}\.pdf$/i)
  .refine((s) => [...s].every((ch) => ch.charCodeAt(0) >= 32), 'No control characters');

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('generate'), request_id: uuid, filename }).strict(),
  z.object({ action: z.literal('restamp'), request_id: uuid }).strict(),
  z.object({ action: z.literal('download'), request_id: uuid, file_id: uuid.optional() }).strict(),
]);

interface Signer {
  name: string;
  png: Uint8Array | null;
}

interface Job {
  name: string;
  number: string | null;
  address: string | null;
  timezone: string;
  gc: string | null;
}

async function jobOf(client: Db, projectId: string): Promise<Job> {
  const p = must(
    await client.from('projects').select('name, number, address, timezone, org_id').eq('id', projectId).single(),
    'project lookup',
  ) as Omit<Job, 'gc'> & { org_id: string };
  const org = must(await client.from('orgs').select('name').eq('id', p.org_id).maybeSingle(), 'company lookup') as
    { name: string } | null;
  return { name: p.name, number: p.number, address: p.address, timezone: p.timezone, gc: org?.name ?? null };
}

/** The requester's name for the form: a member's as the caller may see it (people_display), or the name a visitor
 *  typed on the public request link (0055). */
async function requesterName(client: Db, row: IrRow): Promise<string> {
  if (row.requested_by === null) return row.requester_name ?? 'Requester';
  const people = await rpc<{ user_id: string | null; full_name: string }[]>(client, 'people_display', { p_project_id: row.project_id });
  return people.find((p) => p.user_id === row.requested_by)?.full_name ?? 'Requester';
}

function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

/** The caller's own name and signature image (own profile row; own folder in the signatures bucket). */
async function signerOf(client: Db, userId: string, email: string | undefined): Promise<Signer> {
  const profile = must(
    await client.from('profiles').select('full_name, signature_path').eq('user_id', userId).maybeSingle(),
    'profile lookup',
  ) as { full_name: string; signature_path: string | null } | null;
  const name = profile?.full_name || email || 'Inspector';
  if (!profile?.signature_path) return { name, png: null };
  const { data, error } = await client.storage.from('signatures').download(profile.signature_path);
  if (error || !data) throw storageError(error ?? { message: 'no data' }, 'signature download');
  const png = new Uint8Array(await data.arrayBuffer());
  if (!isPng(png)) throw new HttpError(400, 'Your signature image must be a PNG.');
  return { name, png };
}

/** The result photos: rows read as the caller (their own uploads), bytes through the service client. */
async function photoBytes(client: Db, service: Db, row: IrRow): Promise<Uint8Array[]> {
  const ids = row.result_photo_ids;
  if (ids.length === 0) return [];
  const files = must(
    await client.from('files').select('id, storage_path, mime').eq('project_id', row.project_id).in('id', ids).is('deleted_at', null),
    'photo lookup',
  ) as { id: string; storage_path: string; mime: string }[];
  const byId = new Map(files.map((f) => [f.id, f]));
  const out: Uint8Array[] = [];
  for (const id of ids) {
    const f = byId.get(id);
    if (!f) throw new HttpError(400, 'A photo is missing. Add it again.');
    if (!/^image\/(jpeg|png)$/.test(f.mime)) throw new HttpError(400, 'Photos must be JPEG or PNG.');
    const { data, error } = await service.storage.from('files').download(f.storage_path);
    if (error || !data) throw storageError(error ?? { message: 'no data' }, 'photo download');
    out.push(new Uint8Array(await data.arrayBuffer()));
  }
  return out;
}

async function render(client: Db, service: Db, row: IrRow, signer: Signer, signedAt: string, postponed: boolean): Promise<Uint8Array> {
  const job = await jobOf(client, row.project_id);
  const bytes = await buildInspectionReport({
    job: { name: job.name, number: job.number, address: job.address },
    gc: job.gc,
    inspector: signer.name,
    inspectorLabel: row.kind === 'ofs' ? 'Fire marshal' : 'Inspector',
    number: row.number,
    dateLabel: dayLabel(row.request_date),
    timeLabel: timeLabel(row.start_time),
    durationLabel: durationLabel(row),
    typeLabel: typeLabel(row),
    company: row.company,
    requestedBy: await requesterName(client, row),
    items: row.items,
    resultLabel: resultLabel(row.result),
    approved: row.result === 'approved',
    resultNote: row.result_note,
    photos: await photoBytes(client, service, row),
    postponed: postponed
      ? {
        reason: postponeLabel(row.postpone_reason),
        note: row.postpone_note,
        until: row.postpone_until ? dayLabel(row.postpone_until) : null,
      }
      : null,
  });
  return stampSignature(bytes, { signaturePng: signer.png, name: signer.name, signedAtLabel: signedAtLabel(signedAt, job.timezone) });
}

interface SignedRow {
  content_hash: string | null;
  signed_at: string | null;
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);

  if (body.action === 'download') {
    let fileId = body.file_id;
    if (!fileId) {
      const row = await loadRequest(client, body.request_id);
      if (!row.ir_file_id) throw new HttpError(404, 'There is no IR yet.');
      fileId = row.ir_file_id;
    }
    const rows = await rpc<{ storage_path: string; original_name: string; mime: string }[]>(client, 'authorize_ir_file', {
      p_request_id: body.request_id,
      p_file_id: fileId,
    });
    const f = rows?.[0];
    if (!f) throw new HttpError(404, 'File not found');
    const url = await signedDownloadUrl(serviceClient(), 'files', f.storage_path, f.original_name);
    return ok(req, { url, filename: f.original_name, mime: f.mime });
  }

  const row = await loadRequest(client, body.request_id);
  await requireCapability(client, row.project_id, decideCapability(row));
  // The inspector never signs or re-stamps an OFS IR: until he sends the request to OFS he only routes it (ir_decider).
  if (row.kind === 'ofs' && row.ofs_sent_at === null) throw new HttpError(400, 'Send it to OFS first.');
  // An OFS IR is filed apart from the inspector's IRs; the database checks the caller against that folder (ir_folder).
  const folder = { p_project_id: row.project_id, p_which: reportFolder(row) };

  if (body.action === 'restamp') {
    if (!row.ir_file_id || !row.signed_at || !row.content_hash) throw new HttpError(409, 'There is no PDF.');
    if (row.signed_by !== user.id) throw new HttpError(403, 'Only the person who signed it can re-stamp it. Use Update PDF.');
    if (row.pdf_stale) return refuse(req, 409, 'stale', 'The IR changed. Use Update PDF.');
    const postponed = row.status === 'postponed';
    if (postponed === row.pdf_postponed) return ok(req, { id: row.id, ir_file_id: row.ir_file_id });
    const hash = await irHash(row);
    if (hash !== row.content_hash) return refuse(req, 409, 'stale', 'The IR changed. Use Update PDF.');
    const current = must(await client.from('files').select('original_name').eq('id', row.ir_file_id).single(), 'IR file') as
      { original_name: string };
    const service = serviceClient();
    const bytes = await render(client, service, row, await signerOf(client, user.id, user.email), row.signed_at, postponed);
    const folderId = await rpc<string>(client, 'ir_folder', folder);
    const stored = await storeGeneratedPdf(service, {
      projectId: row.project_id, folderId, name: current.original_name, bytes, createdBy: user.id, replaces: row.ir_file_id,
    });
    const done = await rpc<Record<string, unknown>>(service, 'ir_attach_pdf', {
      p_request_id: row.id, p_file_id: stored.id, p_content_hash: hash, p_postponed: postponed,
    });
    return ok(req, done);
  }

  // generate
  if (!row.result) throw new HttpError(400, 'Record the result first.');
  if (row.status === 'postponed') throw new HttpError(400, 'Confirm it again first.');
  if (!(await signingConfirmed(client, user, req))) return refuse(req, 403, 'reauth_required', 'Confirm it is you to sign this IR');
  const hash = await irHash(row);
  const signed = await rpc<SignedRow>(client, 'ir_sign', { p_request_id: row.id, p_version: row.version, p_content_hash: hash });
  if (signed.content_hash !== hash || !signed.signed_at) {
    throw new HttpError(500, `IR ${row.id}: the stored signature does not match the content that was hashed`);
  }
  const service = serviceClient();
  const bytes = await render(client, service, row, await signerOf(client, user.id, user.email), signed.signed_at, false);
  const folderId = await rpc<string>(client, 'ir_folder', folder);
  const stored = await storeGeneratedPdf(service, {
    projectId: row.project_id, folderId, name: body.filename, bytes, createdBy: user.id, replaces: row.ir_file_id,
  });
  const done = await rpc<Record<string, unknown>>(service, 'ir_attach_pdf', {
    p_request_id: row.id, p_file_id: stored.id, p_content_hash: hash, p_postponed: false,
  });
  return ok(req, done);
}));
