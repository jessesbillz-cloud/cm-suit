// The official stamps a permit's plans and issues it (migration 0053, SPEC §6.9). Signed-in users only; every step runs
// as the caller first. One PDF per request, so memory stays bounded (pdf-lib holds about 3x a file): the app calls
// 'stamp' once per file, then 'record' once for the whole set.
//   stamp:  requireUser → the permit AS THE CALLER (RLS; unseen = 404) → requireCapability('permits.manage') → the
//           version the person saw → permit_approved (as the caller: may it be stamped now?) → a fresh sign-in
//           (signingConfirmed) else 403 reauth_required → permit_stamp_source() as the caller (a PDF on this job, not a
//           stamped copy, through authorize_download: folder access, scan rules, logged; its size is the stored
//           object's) → the size limit, before a byte is read → the bytes and their sha256 → the content hash of the
//           stamp's facts, the original's sha256 among them → the approval stamp on EVERY page (_shared/pdf/stamp.ts) →
//           storeGeneratedPdf into the job's server-only "Stamping" folder (permit_stamp_folders, as the caller; it
//           stores the copy's own sha256) → the server's record of the copy (permit_stamped_copies, 0054).
//   record: requireUser → the permit as the caller → requireCapability → a fresh sign-in → permit_record_stamped_set()
//           as the caller with the copies' ids only: the original, the time, the number and the hash come from the
//           server's record, the copy's sha256 from its files row (version check, the set, the move to issued, audit,
//           ONE board line). The same set again returns the first answer.
//   view:   a stamped file of this permit in the browser's own viewer: the permit's sets read as the caller, then
//           authorize_download as the caller (logged), then a fresh signed URL without the download header.
// Service client (admin_service_key_allowlist.txt): reading the original's bytes from private storage, storing the
// stamped copy (storage + files row) and the server's record of it, and signing view URLs; each only after the
// caller-run checks above.
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, signedViewUrl, storageError } from '../_shared/db.ts';
import { requireCapability, requireUser, signingConfirmed } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { storeGeneratedPdf } from '../_shared/generatedPdf.ts';
import { stampApproval } from '../_shared/pdf/stamp.ts';
import { dateInZone } from '../_shared/rfis.ts';
import { sha256HexBytes } from '../_shared/crypto.ts';
import { STAMP_MAX_BYTES, approvedName, looksLikePdf, stampHash, stampRecord, tooLargeMessage } from '../_shared/permitStamp.ts';

const version = z.number().int().positive();
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('stamp'), permit_id: uuid, version, file_id: uuid }).strict(),
  z.object({
    action: z.literal('record'),
    permit_id: uuid,
    version,
    // The copies 'stamp' made, in the order picked; everything else about them is the server's own record.
    stamped_file_ids: z.array(uuid).min(1).max(200),
    note: z.string().max(1000).optional(),
  }).strict(),
  z.object({ action: z.literal('view'), permit_id: uuid, file_id: uuid }).strict(),
]);

interface Permit {
  id: string;
  project_id: string;
  primary_number: string;
  version: number;
}

interface Source {
  storage_path: string;
  original_name: string;
  mime: string;
  size: number;
}

/** The permit as the caller sees it (permits.read); unseen = 404. */
async function loadPermit(client: Db, id: string): Promise<Permit> {
  const p = must(
    await client.from('permits').select('id, project_id, primary_number, version').eq('id', id).is('deleted_at', null).maybeSingle(),
    'permit lookup',
  ) as Permit | null;
  if (!p) throw new HttpError(404, 'Permit not found');
  return p;
}

/** The official's own name and company (their profile, read as themselves). */
async function signer(client: Db, userId: string): Promise<{ name: string; company: string }> {
  const p = must(await client.from('profiles').select('full_name, email, company').eq('user_id', userId).single(), 'profile') as
    { full_name: string | null; email: string; company: string | null };
  return { name: p.full_name?.trim() || p.email.split('@')[0] || 'Official', company: p.company?.trim() ?? '' };
}

/** The original's bytes from private storage (the Blob is dropped here, so only one copy stays in memory). */
async function originalBytes(service: Db, src: Source): Promise<Uint8Array> {
  const { data, error } = await service.storage.from('files').download(src.storage_path);
  if (error || !data) throw storageError(error ?? { message: 'no data' }, 'original download');
  if (data.size > STAMP_MAX_BYTES) throw new HttpError(400, tooLargeMessage(data.size));
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!looksLikePdf(bytes)) throw new HttpError(400, 'This file is not a PDF.');
  return bytes;
}

async function stamp(client: Db, user: { id: string }, permit: Permit, fileId: string) {
  const src = (await rpc<Source[]>(client, 'permit_stamp_source', { p_permit_id: permit.id, p_file_id: fileId }))?.[0];
  if (!src) throw new HttpError(404, 'File not found');
  // The stored object's own size (permit_stamp_source), so an oversized original is refused before it is read.
  if (src.size > STAMP_MAX_BYTES) throw new HttpError(400, tooLargeMessage(src.size));
  const folders = await rpc<{ staging: string }>(client, 'permit_stamp_folders', { p_permit_id: permit.id });
  const job = must(await client.from('projects').select('timezone').eq('id', permit.project_id).single(), 'project') as
    { timezone: string };
  const who = await signer(client, user.id);

  const service = serviceClient();
  const original = await originalBytes(service, src);
  const facts = {
    permitId: permit.id, permitNumber: permit.primary_number, sourceFileId: fileId,
    sourceSha256: await sha256HexBytes(original), stampedBy: user.id, stampedAt: new Date().toISOString(),
  };
  const hash = await stampHash(facts);
  const out = await stampApproval(original, {
    company: who.company, permitLabel: `Permit ${permit.primary_number}`, name: who.name,
    dateLabel: dateInZone(facts.stampedAt, job.timezone), hash,
  }).catch((e: unknown) => {
    // A PDF pdf-lib can't read (damaged, locked): the person's file, not our failure. Logged all the same.
    if (e instanceof Error && e.message.startsWith('This PDF')) throw new HttpError(400, e.message);
    console.warn(`permit-stamp: ${src.original_name} could not be read`, e);
    throw new HttpError(400, `${src.original_name} could not be read as a PDF.`);
  });
  const name = approvedName(src.original_name, permit.primary_number);
  const stored = await storeGeneratedPdf(service, {
    projectId: permit.project_id, folderId: folders.staging, name, bytes: out.bytes, createdBy: user.id,
  });
  // What recording the set copies (permit_record_stamped_set): written only here, with the service key.
  must(await service.from('permit_stamped_copies').insert(stampRecord(facts, stored.id, hash)), 'stamp record');
  return { source_file_id: fileId, stamped_file_id: stored.id, stamped_at: facts.stampedAt, name, pages: out.pages };
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 64 * 1024);
  const permit = await loadPermit(client, body.permit_id);

  if (body.action === 'view') {
    const a = await rpc<{ sets: { files: { file_id: string }[] }[] }>(client, 'permit_approved', { p_permit_id: permit.id });
    if (!a.sets.some((s) => s.files.some((f) => f.file_id === body.file_id))) throw new HttpError(404, 'File not found');
    const f = (await rpc<Source[]>(client, 'authorize_download', { p_file_id: body.file_id, p_variant: 'original' }))?.[0];
    if (!f) throw new HttpError(404, 'File not found');
    return ok(req, { url: await signedViewUrl(serviceClient(), f.storage_path) });
  }

  await requireCapability(client, permit.project_id, 'permits.manage');
  if (body.action === 'stamp') {
    if (permit.version !== body.version) throw new HttpError(409, 'The permit changed. Reload and try again.');
    const mode = (await rpc<{ stamp: string | null }>(client, 'permit_approved', { p_permit_id: permit.id })).stamp;
    if (mode === null) throw new HttpError(409, "This permit can't be stamped now.");
  }
  if (!(await signingConfirmed(client, user, req))) return refuse(req, 403, 'reauth_required', 'Confirm it is you to stamp these plans');

  if (body.action === 'stamp') return ok(req, await stamp(client, user, permit, body.file_id));

  // record: the version is checked by the RPC after its repeat check, so a retry after success gets the first answer.
  const result = await rpc<Record<string, unknown>>(client, 'permit_record_stamped_set', {
    p_permit_id: permit.id, p_version: body.version, p_stamped_file_ids: body.stamped_file_ids, p_note: body.note ?? null,
  });
  return ok(req, result);
}));
