// PUBLIC ENDPOINT (SPEC §6.4 #5, §8.5): Resend Inbound webhook (`email.received`).
//
// Why public: Resend posts inbound mail events server-to-server without a Supabase session. Gated by requireWebhook
// (Svix HMAC signature over the raw body + a 5-minute timestamp window, constant-time), de-duplicated on
// data.email_id (email_inbound.message_id is unique). Service role: webhooks have no user. The raw message and
// attachments go to the private 'inbound' bucket.
//
// The webhook carries metadata only. The body and headers come from GET /emails/receiving/{id}, and each attachment
// from GET /emails/receiving/{id}/attachments/{attachment_id}, whose short-lived download_url is fetched for the bytes.
//
// Phase 0 stores and QUARANTINES everything (sorting is Phase 1). A spoofed From is never trusted: sender_member_id is
// set only when From matches an active member AND SPF and DKIM both clearly pass. Nothing is sent, filed or approved
// automatically.
import { handlePublic, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, storageError } from '../_shared/db.ts';
import { requireWebhook } from '../_shared/auth.ts';
import { parseText, readBody, z } from '../_shared/validate.ts';
import { audit } from '../_shared/audit.ts';
import { enqueue } from '../_shared/queue.ts';
import { env } from '../_shared/env.ts';

const RESEND_API = 'https://api.resend.com';
/** Per attachment and per message. Larger attachments are recorded as skipped, not stored. */
const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

// Used in storage paths, so restricted to a safe alphabet (Resend ids are UUIDs).
const EmailId = z.string().regex(/^[A-Za-z0-9._-]{1,200}$/);

// VERIFY: attachment fields (id, filename, content_type, size) against Resend's "Retrieve received email" docs.
const Attachment = z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]{1,200}$/),
  filename: z.string().max(500).nullish(),
  content_type: z.string().max(200).nullish(),
  size: z.number().int().nonnegative().nullish(),
}).passthrough();
type AttachmentMeta = z.output<typeof Attachment>;

// VERIFY: whether Resend puts SPF/DKIM verdicts on the event (`data.spf` / `data.dkim` here) and in what shape.
// Absent → the Authentication-Results / Received-SPF headers decide.
const Verdict = z.union([
  z.string().max(200),
  z.object({ result: z.string().max(60).optional(), status: z.string().max(60).optional(), domain: z.string().max(255).optional() }).passthrough(),
]).optional();
type VerdictIn = z.output<typeof Verdict>;

const Event = z.object({
  type: z.string().min(1).max(60),
  created_at: z.string().max(60).optional(),
  data: z.object({
    email_id: EmailId,
    from: z.string().max(1000).default(''),
    to: z.array(z.string().max(1000)).max(100).default([]),
    cc: z.array(z.string().max(1000)).max(100).nullish(),
    subject: z.string().max(2000).nullish(),
    message_id: z.string().max(1000).nullish(),
    attachments: z.array(Attachment).max(100).nullish(),
    spf: Verdict,
    dkim: Verdict,
  }).passthrough(),
}).passthrough();
type Inbound = z.output<typeof Event>;

// GET /emails/receiving/{id}. VERIFY: `headers` shape (object map vs. array of {name, value}); both are accepted.
const Received = z.object({
  html: z.string().nullish(),
  text: z.string().nullish(),
  headers: z.unknown().optional(),
  cc: z.array(z.string().max(1000)).max(100).nullish(),
  attachments: z.array(Attachment).max(100).nullish(),
}).passthrough();
type ReceivedEmail = z.output<typeof Received>;

// GET /emails/receiving/{id}/attachments/{attachment_id}. VERIFY: `download_url` field name.
const AttachmentDownload = z.object({
  download_url: z.string().url().startsWith('https://'),
  size: z.number().int().nonnegative().nullish(),
}).passthrough();

type Header = { name: string; value: string };

async function resendGet<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.output<S>> {
  const res = await fetch(`${RESEND_API}${path}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${env('RESEND_API_KEY')}` },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  // Throwing makes the webhook fail, so Resend retries it; nothing has been recorded yet.
  if (!res.ok) throw new HttpError(502, `resend GET ${path}: ${res.status} ${text.slice(0, 300)}`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new HttpError(502, `resend GET ${path}: unreadable reply (${e instanceof Error ? e.message : String(e)})`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(502, `resend GET ${path}: unexpected shape ${JSON.stringify(parsed.error.flatten()).slice(0, 500)}`);
  return parsed.data;
}

/** Headers as an ordered list, from either an object map (value string or string[]) or an array of pairs. */
function normalizeHeaders(h: unknown): Header[] {
  const out: Header[] = [];
  if (Array.isArray(h)) {
    for (const item of h) {
      if (item && typeof item === 'object') {
        const r = item as Record<string, unknown>;
        const name = r.name ?? r.Name ?? r.key;
        const value = r.value ?? r.Value;
        if (typeof name === 'string' && typeof value === 'string') out.push({ name, value });
      }
    }
  } else if (h && typeof h === 'object') {
    for (const [name, value] of Object.entries(h as Record<string, unknown>)) {
      if (typeof value === 'string') out.push({ name, value });
      else if (Array.isArray(value)) for (const v of value) if (typeof v === 'string') out.push({ name, value: v });
    }
  }
  return out.slice(0, 500);
}

function headerValues(headers: Header[], name: string): string[] {
  const n = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === n).map((h) => h.value);
}

function verdictResult(v: VerdictIn): string | null {
  if (v === undefined) return null;
  if (typeof v === 'string') return v.trim().toLowerCase();
  return (v.result ?? v.status ?? '').trim().toLowerCase() || null;
}

function aligned(fromDomain: string, signingDomain: string): boolean {
  const d = signingDomain.toLowerCase().replace(/[>;.]+$/, '');
  return fromDomain === d || fromDomain.endsWith(`.${d}`);
}

/**
 * The receiver's Authentication-Results. A header that appears more than once is ambiguous (a sender could have
 * added their own) and counts as absent. VERIFY: that Resend adds exactly one Authentication-Results header.
 */
function authResults(headers: Header[]): string | null {
  const ar = headerValues(headers, 'Authentication-Results');
  return ar.length === 1 ? ar[0] : null;
}

/** SPF: Resend's own verdict if it sends one; else Authentication-Results spf=pass; else the topmost Received-SPF. */
function spfPassed(b: Inbound, headers: Header[]): boolean {
  const own = verdictResult(b.data.spf);
  if (own !== null) return own === 'pass';
  const ar = authResults(headers);
  if (ar !== null) return /\bspf=pass\b/i.test(ar);
  // VERIFY: header order (topmost first) in the received-email response.
  const top = headerValues(headers, 'Received-SPF')[0];
  return !!top && /^pass\b/i.test(top.trim());
}

/**
 * DKIM: a valid signature from the From domain. Resend's own verdict counts only when it names an aligned signing
 * domain; otherwise Authentication-Results "dkim=pass header.d=<from domain>" decides.
 */
function dkimPassed(b: Inbound, headers: Header[], fromEmail: string): boolean {
  const fromDomain = fromEmail.split('@')[1] ?? '';
  if (!fromDomain) return false;
  const own = b.data.dkim;
  if (own !== undefined && typeof own === 'object' && own.domain) {
    return verdictResult(own) === 'pass' && aligned(fromDomain, own.domain);
  }
  if (own !== undefined && verdictResult(own) !== 'pass') return false;
  const ar = authResults(headers);
  if (ar === null) return false;
  for (const m of ar.matchAll(/\bdkim=pass\b[^;]*?header\.d=([^\s;]+)/gi)) {
    if (aligned(fromDomain, m[1])) return true;
  }
  return false;
}

function parseAddress(raw: string): { email: string; name: string | null } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim() || null };
  return { email: raw.trim().toLowerCase(), name: null };
}

function recipientAddresses(b: Inbound, detail: ReceivedEmail): string[] {
  const all = [...b.data.to, ...(b.data.cc ?? detail.cc ?? [])]
    .map((a) => parseAddress(a).email).filter((a) => a.includes('@'));
  // Also match without plus-addressing (rsa-21050+thread@in.… → rsa-21050@in.…).
  const bare = all.map((a) => a.replace(/\+[^@]*@/, '@'));
  return [...new Set([...all, ...bare])];
}

interface Route {
  projectId: string | null;
  orgId: string | null;
  toAddress: string;
}

async function route(service: Db, addrs: string[]): Promise<Route> {
  const fallback = addrs[0] ?? 'unknown';
  if (addrs.length === 0) return { projectId: null, orgId: null, toAddress: fallback };
  const projects = must(
    await service.from('projects').select('id, org_id, inbound_address').in('inbound_address', addrs).is('deleted_at', null).limit(1),
    'project routing',
  ) as { id: string; org_id: string; inbound_address: string }[];
  if (projects[0]) return { projectId: projects[0].id, orgId: projects[0].org_id, toAddress: projects[0].inbound_address };
  const orgs = must(
    await service.from('orgs').select('id, intake_address').in('intake_address', addrs).is('deleted_at', null).limit(1),
    'org routing',
  ) as { id: string; intake_address: string }[];
  if (orgs[0]) return { projectId: null, orgId: orgs[0].id, toAddress: orgs[0].intake_address };
  return { projectId: null, orgId: null, toAddress: fallback };
}

function safeName(name: string): string {
  // deno-lint-ignore no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f/\\]+/g, '_').replace(/^\.+/, '_').trim().slice(0, 150);
  return cleaned || 'attachment';
}

async function put(service: Db, path: string, body: Blob, contentType: string): Promise<void> {
  const { error } = await service.storage.from('inbound').upload(path, body, { contentType, upsert: true });
  if (error) throw storageError(error, `inbound upload ${path}`);
}

async function download(emailId: string, a: AttachmentMeta, budget: number): Promise<Blob | string> {
  if ((a.size ?? 0) > Math.min(MAX_ATTACHMENT_BYTES, budget)) return `too large (${a.size} bytes)`;
  const meta = await resendGet(`/emails/receiving/${emailId}/attachments/${a.id}`, AttachmentDownload);
  // Signed, short-lived URL: no Authorization header.
  const res = await fetch(meta.download_url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new HttpError(502, `attachment ${a.id} download: ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > Math.min(MAX_ATTACHMENT_BYTES, budget)) {
    await res.body?.cancel();
    return `too large (${declared} bytes)`;
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > Math.min(MAX_ATTACHMENT_BYTES, budget)) return `too large (${bytes.byteLength} bytes)`;
  return new Blob([bytes], { type: a.content_type ?? 'application/octet-stream' });
}

/** Stores attachments (only for routed mail) and the raw JSON (event + retrieved email). Returns the raw path. */
async function store(service: Db, b: Inbound, detail: ReceivedEmail, list: AttachmentMeta[], routed: boolean): Promise<string> {
  const emailId = b.data.email_id;
  const base = `inbound/${emailId}`;
  const attachments = [];
  let budget = MAX_TOTAL_BYTES;
  for (const [i, a] of list.entries()) {
    if (!routed) {
      attachments.push({ ...a, stored_path: null, skipped: 'unrouted' });
      continue;
    }
    const got = await download(emailId, a, budget);
    if (typeof got === 'string') {
      attachments.push({ ...a, stored_path: null, skipped: got });
      continue;
    }
    budget -= got.size;
    // Index prefix: two attachments may share a name.
    const path = `${base}/${i + 1}-${safeName(a.filename ?? '')}`;
    await put(service, path, got, got.type || 'application/octet-stream');
    attachments.push({ ...a, stored_path: path });
  }
  const rawPath = `${base}.json`;
  const raw = JSON.stringify({ event: b, email: { ...detail, attachments } });
  await put(service, rawPath, new Blob([raw], { type: 'application/json' }), 'application/json');
  return rawPath;
}

async function matchSender(service: Db, projectId: string, from: string): Promise<string | null> {
  const rows = must(
    await service.from('project_members').select('id, access_ends_at')
      .eq('project_id', projectId).eq('invite_email', from).eq('status', 'active'),
    'sender lookup',
  ) as { id: string; access_ends_at: string | null }[];
  const live = rows.find((r) => !r.access_ends_at || new Date(r.access_ends_at).getTime() > Date.now());
  return live?.id ?? null;
}

/** Project admins = active members whose role grants project.manage (read from role_permissions, not role names). */
async function projectAdmins(service: Db, projectId: string): Promise<string[]> {
  const roles = must(
    await service.from('role_permissions').select('role').eq('capability', 'project.manage'),
    'admin roles',
  ) as { role: string }[];
  if (roles.length === 0) return [];
  const members = must(
    await service.from('project_members').select('user_id, access_ends_at')
      .eq('project_id', projectId).eq('status', 'active').not('user_id', 'is', null).in('role', roles.map((r) => r.role)),
    'admin members',
  ) as { user_id: string; access_ends_at: string | null }[];
  const now = Date.now();
  return [...new Set(members.filter((m) => !m.access_ends_at || new Date(m.access_ends_at).getTime() > now).map((m) => m.user_id))];
}

Deno.serve(handlePublic(async (req) => {
  // Read the body once: the signature covers these exact bytes, and it is parsed only after the check passes.
  const text = await readBody(req, 1024 * 1024);
  await requireWebhook(req, 'resend', text);
  const b = parseText(text, Event);
  // Only email.received belongs here; acknowledge anything else so Resend doesn't retry it.
  if (b.type !== 'email.received') return ok(req, { ok: true, ignored: b.type });
  const service = serviceClient();
  const emailId = b.data.email_id;

  const seen = must(
    await service.from('email_inbound').select('id').eq('message_id', emailId).maybeSingle(),
    'dedupe lookup',
  );
  if (seen) return ok(req, { ok: true, duplicate: true });

  const detail = await resendGet(`/emails/receiving/${emailId}`, Received);
  const headers = normalizeHeaders(detail.headers);
  const attachmentList = detail.attachments ?? b.data.attachments ?? [];
  const sender = parseAddress(b.data.from);
  const from = sender.email;
  const subject = b.data.subject ?? '';
  const spf = spfPassed(b, headers);
  const dkim = dkimPassed(b, headers, from);
  const r = await route(service, recipientAddresses(b, detail));
  const rawPath = await store(service, b, detail, attachmentList, r.orgId !== null);
  const senderMemberId = r.projectId && spf && dkim ? await matchSender(service, r.projectId, from) : null;

  const inserted = await service.from('email_inbound').insert({
    message_id: emailId,
    org_id: r.orgId,
    project_id: r.projectId,
    to_address: r.toAddress,
    from_email: from || 'unknown',
    from_name: sender.name,
    subject: subject.slice(0, 1000),
    raw_path: rawPath,
    text_body: detail.text ? detail.text.slice(0, 200_000) : null,
    spf_pass: spf,
    dkim_pass: dkim,
    sender_member_id: senderMemberId,
    status: 'quarantined',
  }).select('id').single();
  if (inserted.error) {
    if (inserted.error.code === '23505') return ok(req, { ok: true, duplicate: true }); // concurrent retry won the race
    throw new HttpError(500, `email_inbound insert: ${inserted.error.message}`);
  }
  const inboundId = (inserted.data as { id: string }).id;

  if (r.projectId) {
    for (const admin of await projectAdmins(service, r.projectId)) {
      await rpc<string>(service, 'create_task', {
        p_project_id: r.projectId,
        p_assignee: admin,
        p_kind: 'inbound_email_review',
        p_title: 'Inbound email to review',
        p_entity_type: 'email_inbound',
        p_entity_id: inboundId,
        p_due_at: null,
        p_requires_signature: false,
        p_payload: { from, subject: subject.slice(0, 300), verified_sender: senderMemberId !== null },
      });
    }
    if (senderMemberId) {
      await enqueue(service, 'sort_inbound_email', { email_inbound_id: inboundId }, r.projectId, `inbound:${emailId}`);
    }
  }

  await audit(service, {
    action: 'email.inbound', actorKind: 'webhook', entityType: 'email_inbound', entityId: inboundId,
    projectId: r.projectId, orgId: r.orgId,
    details: { from, spf_pass: spf, dkim_pass: dkim, verified_sender: senderMemberId !== null, attachments: attachmentList.length },
  });

  return ok(req, { ok: true, id: inboundId, routed: r.orgId !== null, verified_sender: senderMemberId !== null });
}));
