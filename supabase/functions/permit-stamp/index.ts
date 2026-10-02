// The official stamps a permit's plans and issues it (migration 0053, SPEC §6.9). Signed-in users only; every step runs
// as the caller first. One PDF per request, so memory stays bounded (pdf-lib holds about 3x a file): the app calls
// 'stamp' once per file, then 'record' once for the whole set.
//   stamp:  requireUser → the permit AS THE CALLER (RLS; unseen = 404) → requireCapability('permits.manage') → the
//           version the person saw → permit_approved (as the caller: may it be stamped now?) → a fresh sign-in
//           (signingConfirmed) else 403 reauth_required → permit_stamp_source() as the caller (a PDF on this job, not a
//           stamped copy, through authorize_download: folder access, scan rules, logged) → the size limit → the bytes →
//           the content hash of the stamp's facts → the approval stamp on EVERY page (_shared/pdf/stamp.ts) →
//           storeGeneratedPdf into the job's server-only "Stamping" folder (permit_stamp_folders, as the caller).
//   record: requireUser → the permit as the caller → requireCapability → a fresh sign-in → each stamped copy read as
//           the caller (their own) and its hash computed again here from the same facts (never taken from the browser)
//           → permit_record_stamped_set() as the caller (version check, the set, the move to issued, audit, ONE board
//           line). The same set again returns the first answer.
//   view:   a stamped file of this permit in the browser's own viewer: the permit's sets read as the caller, then
//           authorize_download as the caller (logged), then a fresh signed URL without the download header.
// Service client (admin_service_key_allowlist.txt): reading the original's bytes from private storage, storing the
// stamped copy (storage + files row) and signing view URLs; each only after the caller-run checks above.
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, signedViewUrl, storageError } from '../_shared/db.ts';
import { requireCapability, requireUser, signingConfirmed } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { storeGeneratedPdf } from '../_shared/generatedPdf.ts';
import { stampApproval } from '../_shared/pdf/stamp.ts';
import { dateInZone } from '../_shared/rfis.ts';
import { STAMP_MAX_BYTES, approvedName, looksLikePdf, stampHash, tooLargeMessage } from '../_shared/permitStamp.ts';

const version = z.number().int().positive();
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('stamp'), permit_id: uuid, version, file_id: uuid }).strict(),
  z.object({
    action: z.literal('record'),
    permit_id: uuid,
    version,
    items: z.array(z.object({ source_file_id: uuid, stamped_file_id: uuid, stamped_at: z.string().datetime({ offset: true }) })
      .strict()).min(1).max(200),
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
  if (src.size > STAMP_MAX_BYTES) throw new HttpError(400, tooLargeMessage(src.size));
  const folders = await rpc<{ staging: string }>(client, 'permit_stamp_folders', { p_permit_id: permit.id });
  const job = must(await client.from('projects').select('timezone').eq('id', permit.project_id).single(), 'project') as
    { timezone: string };
  const who = await signer(client, user.id);
  const stampedAt = new Date().toISOString();
  const hash = await stampHash({
    permitId: permit.id, permitNumber: permit.primary_number, sourceFileId: fileId, stampedBy: user.id, stampedAt,
  });

  const service = serviceClient();
  const out = await stampApproval(await originalBytes(service, src), {
    company: who.company, permitLabel: `Permit ${permit.primary_number}`, name: who.name,
    dateLabel: dateInZone(stampedAt, job.timezone), hash,
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
  return { source_file_id: fileId, stamped_file_id: stored.id, stamped_at: stampedAt, name, pages: out.pages };
}

type Item = { source_file_id: string; stamped_file_id: string; stamped_at: string };

/** Each stamped copy read as its maker, and its hash from the same facts the stamp printed. */
async function hashed(client: Db, userId: string, permit: Permit, items: Item[]) {
  const ids = items.map((i) => i.stamped_file_id);
  const rows = must(
    await client.from('files').select('id, created_by').in('id', ids).is('deleted_at', null),
    'stamped files',
  ) as { id: string; created_by: string | null }[];
  const mine = new Set(rows.filter((r) => r.created_by === userId).map((r) => r.id));
  return Promise.all(items.map(async (i) => {
    if (!mine.has(i.stamped_file_id)) throw new HttpError(409, 'A stamped file is missing. Stamp it again.');
    const hash = await stampHash({
      permitId: permit.id, permitNumber: permit.primary_number, sourceFileId: i.source_file_id, stampedBy: userId,
      stampedAt: i.stamped_at,
    });
    return { ...i, content_hash: hash };
  }));
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
  const items = await hashed(client, user.id, permit, body.items);
  const result = await rpc<Record<string, unknown>>(client, 'permit_record_stamped_set', {
    p_permit_id: permit.id, p_version: body.version, p_items: items, p_note: body.note ?? null,
  });
  return ok(req, result);
}));
