// PUBLIC ENDPOINT (SPEC §6.4 #4): the job's inspection request link (/r/<job>?t=<token>, on the QR sheet posted on
// site), the inspector's hub (/h/<hub>?t=<token>, one link for all their jobs; MDR's hub.html) and a request's private
// status link (/r/<job>/s/<receipt>).
//
// Why public: subs and their foremen in the field request inspections from the link or the QR code with no account
// (Jesse, Oct 2: login must not be the barrier), the way Jesse's MDR request page works. The tokens are the secret: 32
// random bytes, only their SHA-256 stored (projects.request_token_hash, request_hubs.token_hash, ir_link_receipts),
// rotated by the job's members.manage / the hub's owner, which locks the old link out at once (a receipt stays).
//
// One function, one rate-limit family, one set of probe entries, one contract (_shared/requestLink.ts):
//   open      the job's name, and whether the caller's own session (if any) is already on the job;
//   calendar  the request day as an outsider sees it (time, length, type, color) and the form's choices;
//   submit    multipart: `payload` (the request and the visitor's name, company, phone and/or email) and up to 3 `file`
//             parts (photos or PDFs by their bytes, <= 10 MB each, _shared/requestFiles.ts). The files are registered in
//             the job's request folder by the database and stored here at the path it gives, then the request is made
//             (link_request_submit, 0055): numbered by the database, the GC step and board lines as for a member. The
//             answer carries the private receipt token once;
//   status    by that receipt alone: the tracker's facts and the inspector's result line;
//   join      AFTER the visitor proved their email with the Auth email code ("Sign in to see all your requests"):
//             records a requester invite on that job for the signed-in address (from the session, never the body);
//             accept_invites then binds it. An address already on the job is never changed; a revoked or ended one is
//             refused (403). Fills a blank profile name / company;
//   hub       the hub's job names and ids;
//   revs      (0057) the job's lists, revs, items and walls, and each wall x item's status only (no numbers, notes or
//             names), for the revs request: a `submit` naming `area_ids` / `item_ids` is an OFS request made through
//             link_request_submit_ofs (0055's visitor rules and ir_submit_ofs' walls rules);
//   map, map_save, sheet, map_render, map_download   (0057) by a request's receipt alone: that request's map (read and
//             draw until the inspector records a result), its sheet and its PDF (revs.ts).
// This endpoint grants no access to anything else: membership comes from the email code, accept_invites and RLS, and a
// People revoke ends it. Answers carry only what the pages show, enforced twice: by the service-role-only SQL
// (link_request_* in 0046, 0055 and 0057) and by the projections in _shared/requestLink.ts and requestLinkRevs.ts; a
// database error reaches the visitor only as our own plain refusal, never Postgres' text (publicRpc, 0054). Rate limits
// per IP (the address the edge saw, clientIp) and per token or receipt on every call; tighter ones on submit (before its
// body is read), on join and on making a map PDF. Only a map save may be bigger than 4 KB (its strokes, up to 2 MB).
import { created, handlePublic, HttpError, ok } from '../_shared/http.ts';
import { type Db, publicDbError, publicRpc, serviceClient, storageError } from '../_shared/db.ts';
import { optionalUser, requireUser } from '../_shared/auth.ts';
import { isMultipart, parseText, readBody, readForm } from '../_shared/validate.ts';
import { clientIp, limit } from '../_shared/ratelimit.ts';
import { audit } from '../_shared/audit.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import {
  calendarAnswer,
  hubAnswer,
  joinAnswer,
  openAnswer,
  registeredFiles,
  statusAnswer,
  type SubmitRequest,
  submitAnswer,
} from '../_shared/requestLink.ts';
import { isMapRequest, LinkBody, MAP_SAVE_MAX_BYTES, REQUEST_MAX_BYTES, type SubmitOfsRequest, submitPayload } from '../_shared/requestLinkRevs.ts';
import { type LinkArgs, mapAction, revs } from './revs.ts';
import { type CheckedFile, checkedFiles, MAX_SUBMIT_BYTES, payloadOf, TOO_LARGE } from '../_shared/requestFiles.ts';

const NOT_ACTIVE = 'This link is not active. Ask the inspector for the current one.';

/** A blank profile name or company takes what the visitor typed; anything already there stays. Runs as the user. */
async function fillProfile(client: Db, userId: string, name: string, company: string): Promise<void> {
  const steps = [
    client.from('profiles').update({ full_name: name }).eq('user_id', userId).eq('full_name', ''),
    client.from('profiles').update({ company }).eq('user_id', userId).is('company', null),
    client.from('profiles').update({ company }).eq('user_id', userId).eq('company', ''),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) throw publicDbError(error, 'profile fill');
  }
}

/** The database registers the files in the job's request folder and names their paths; the bytes go there. */
async function storeFiles(service: Db, link: LinkArgs, files: CheckedFile[]): Promise<string[]> {
  if (files.length === 0) return [];
  const raw = await publicRpc<unknown>(service, 'link_request_files', {
    ...link,
    p_files: files.map((f) => ({ name: f.name, mime: f.mime, size: f.bytes.length, sha256: f.sha256 })),
  });
  if (raw === null) throw new HttpError(404, NOT_ACTIVE);
  const slots = registeredFiles(raw, files.length);
  for (const [i, f] of files.entries()) {
    const slot = slots[i];
    if (!slot) throw new HttpError(500, 'link_request_files answered too few slots');
    const { error } = await service.storage.from('files').upload(slot.storage_path, f.bytes, { contentType: f.mime, upsert: false });
    if (error) throw storageError(error, 'upload request file');
  }
  return slots.map((s) => s.id);
}

/** Who is asking and when, as every link request carries it. */
function visitorArgs(body: SubmitRequest | SubmitOfsRequest) {
  return {
    p_name: body.name,
    p_company: body.company,
    p_phone: body.phone,
    p_email: body.email,
    p_request_date: body.date,
    p_notice_ack: body.notice_ack,
    p_start_time: body.time,
    p_duration_kind: body.duration_kind,
    p_duration_min: body.duration_min,
  };
}

async function submit(req: Request, service: Db, ip: string): Promise<Response> {
  // Tighter than every other action, and spent before the (up to 30 MB) body is read.
  await limit(service, `request-link:submit-ip:${ip}`, 10, 10 / 3600);
  const form = await readForm(req, MAX_SUBMIT_BYTES, TOO_LARGE);
  const sent = submitPayload(payloadOf(form));
  const body = sent.body;
  const tokenHash = await sha256Hex(body.token);
  const tokenKey = tokenHash.slice(0, 32);
  await limit(service, `request-link:token:${tokenKey}`, 120, 2);
  // A busy site: many phones, one QR sheet.
  await limit(service, `request-link:submit-token:${tokenKey}`, 60, 60 / 3600);
  const files = await checkedFiles(form);
  const link: LinkArgs = { p_project_id: body.project_id, p_token_hash: tokenHash, p_hub_id: body.hub_id ?? null };
  const ids = await storeFiles(service, link, files);
  // The revs request names its walls and items; the database composes what to inspect and makes the cells and the map.
  const raw = sent.ofs
    ? await publicRpc<unknown>(service, 'link_request_submit_ofs', {
      ...link,
      ...visitorArgs(sent.body),
      p_area_ids: sent.body.area_ids,
      p_item_ids: sent.body.item_ids,
      p_sheet_file_id: sent.body.sheet_file_id,
      p_attachment_ids: ids,
    })
    : await publicRpc<unknown>(service, 'link_request_submit', {
      ...link,
      ...visitorArgs(sent.body),
      p_kind: sent.body.kind,
      p_items: sent.body.items,
      p_special_kind_id: sent.body.special_kind_id,
      p_attachment_ids: ids,
    });
  if (raw === null) throw new HttpError(404, NOT_ACTIVE);
  const answer = submitAnswer(raw);
  // The SQL audit row has the typed name and company; this one adds where the visit came from.
  await audit(service, {
    action: 'request_link.visit',
    actorKind: 'public_link',
    entityType: 'project',
    entityId: body.project_id,
    projectId: body.project_id,
    details: { status: 'submitted', number: answer.number, files: ids.length, via: body.hub_id ? 'hub' : 'link', walls: sent.ofs },
    req,
  });
  return created(req, answer);
}

Deno.serve(handlePublic(async (req) => {
  const service = serviceClient();
  const ip = clientIp(req) ?? 'unknown';
  await limit(service, `request-link:ip:${ip}`, 30, 0.5);
  if (isMultipart(req)) return await submit(req, service, ip);
  const text = await readBody(req, MAP_SAVE_MAX_BYTES);
  const body = parseText(text, LinkBody);
  if (body.action !== 'map_save' && text.length > REQUEST_MAX_BYTES) throw new HttpError(400, 'Request body too large');
  if (isMapRequest(body)) return await mapAction(req, service, ip, body);

  if (body.action === 'status') {
    const receiptHash = await sha256Hex(body.receipt);
    // Keyed by the hash, never the raw token: someone opening their bookmark now and then.
    await limit(service, `request-link:status:${receiptHash.slice(0, 32)}`, 30, 30 / 3600);
    const raw = await publicRpc<unknown>(service, 'link_request_status', { p_project_id: body.project_id, p_receipt_hash: receiptHash });
    if (raw === null) throw new HttpError(404, 'That request is not available.');
    return ok(req, statusAnswer(raw));
  }

  const tokenHash = await sha256Hex(body.token);
  // Keyed by the hash, never the raw token. A QR sheet on a busy site: many phones, one token.
  const tokenKey = tokenHash.slice(0, 32);
  await limit(service, `request-link:token:${tokenKey}`, 120, 2);

  if (body.action === 'hub') {
    const raw = await publicRpc<unknown>(service, 'link_request_hub', { p_hub_id: body.hub_id, p_token_hash: tokenHash });
    if (raw === null) throw new HttpError(404, NOT_ACTIVE);
    return ok(req, hubAnswer(raw));
  }

  const link: LinkArgs = { p_project_id: body.project_id, p_token_hash: tokenHash, p_hub_id: body.hub_id ?? null };

  if (body.action === 'open') {
    const raw = await publicRpc<unknown>(service, 'link_request_open', link);
    if (raw === null) throw new HttpError(404, NOT_ACTIVE);
    // Only about the caller's own session, asked as the caller (RLS helpers read auth.uid()).
    const me = await optionalUser(req);
    const member = me ? await publicRpc<boolean>(me.client, 'is_member', { p_project_id: body.project_id }) : false;
    const canRequest = me && member
      ? await publicRpc<boolean>(me.client, 'has_capability', { p_project_id: body.project_id, p_cap: 'ir.request' })
      : false;
    return ok(req, openAnswer(raw, member === true, canRequest === true));
  }

  if (body.action === 'calendar') {
    const raw = await publicRpc<unknown>(service, 'link_request_calendar', { ...link, p_day: body.day ?? null });
    if (raw === null) throw new HttpError(404, NOT_ACTIVE);
    return ok(req, calendarAnswer(raw));
  }

  if (body.action === 'revs') return await revs(req, service, link, NOT_ACTIVE);

  // join
  await limit(service, `request-link:join-ip:${ip}`, 10, 10 / 3600);
  await limit(service, `request-link:join-token:${tokenKey}`, 60, 60 / 3600);
  const { user, client } = await requireUser(req);
  const email = (user.email ?? '').trim().toLowerCase();
  if (!email) throw new HttpError(400, 'Sign in with an email address first.');
  const raw = await publicRpc<unknown>(service, 'link_request_join', { ...link, p_email: email, p_name: body.name, p_company: body.company });
  if (raw === null) throw new HttpError(404, NOT_ACTIVE);
  const answer = joinAnswer(raw);
  await fillProfile(client, user.id, body.name, body.company);
  // The SQL audit row has the typed name and company; this one adds who and where the visit came from.
  await audit(service, {
    action: 'request_link.visit',
    actorKind: 'public_link',
    actorUserId: user.id,
    entityType: 'project',
    entityId: body.project_id,
    projectId: body.project_id,
    details: { status: answer.status, via: body.hub_id ? 'hub' : 'link' },
    req,
  });
  return answer.status === 'added' ? created(req, answer) : ok(req, answer);
}));
