// PUBLIC ENDPOINT (SPEC §6.4 #5, §8.5): Postmark Inbound webhook.
//
// Why public: Postmark posts inbound mail server-to-server without a Supabase session. Gated by requireWebhook
// (Basic Auth in the webhook URL + secret header, constant-time), de-duplicated on MessageID (unique column).
// Service role: webhooks have no user. The raw message and attachments go to the private 'inbound' bucket.
//
// Phase 0 stores and QUARANTINES everything (sorting is Phase 1). A spoofed From is never trusted: sender_member_id is
// set only when From matches an active member AND Postmark's SPF and DKIM results both clearly pass. Nothing is sent,
// filed or approved automatically.
import { handlePublic, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, storageError } from '../_shared/db.ts';
import { requireWebhook } from '../_shared/auth.ts';
import { parseJson, z } from '../_shared/validate.ts';
import { audit } from '../_shared/audit.ts';
import { enqueue } from '../_shared/queue.ts';
import { base64ToBytes } from '../_shared/crypto.ts';

const Address = z.object({ Email: z.string().max(320), Name: z.string().max(320).optional() }).passthrough();
const Body = z.object({
  MessageID: z.string().regex(/^[A-Za-z0-9._-]{1,200}$/),
  From: z.string().max(1000).default(''),
  FromName: z.string().max(320).optional(),
  FromFull: Address.optional(),
  ToFull: z.array(Address).max(100).default([]),
  CcFull: z.array(Address).max(100).default([]),
  OriginalRecipient: z.string().max(320).optional(),
  Subject: z.string().max(2000).default(''),
  TextBody: z.string().optional(),
  HtmlBody: z.string().optional(),
  Headers: z.array(z.object({ Name: z.string(), Value: z.string() })).max(500).default([]),
  Attachments: z.array(z.object({
    Name: z.string().max(500),
    Content: z.string(),
    ContentType: z.string().max(200).default('application/octet-stream'),
    ContentLength: z.number().int().nonnegative().optional(),
  }).passthrough()).max(100).default([]),
}).passthrough();
type Inbound = z.output<typeof Body>;

type Header = { Name: string; Value: string };

function headerValues(headers: Header[], name: string): string[] {
  const n = name.toLowerCase();
  return headers.filter((h) => h.Name.toLowerCase() === n).map((h) => h.Value);
}

/** SPF: Postmark prepends its own Received-SPF; only the topmost counts and it must start with "pass". */
function spfPassed(headers: Header[]): boolean {
  const top = headerValues(headers, 'Received-SPF')[0];
  return !!top && /^pass\b/i.test(top.trim());
}

function aligned(fromDomain: string, signingDomain: string): boolean {
  const d = signingDomain.toLowerCase().replace(/[>;.]+$/, '');
  return fromDomain === d || fromDomain.endsWith(`.${d}`);
}

/**
 * DKIM: a valid signature from the From domain. Either SpamAssassin's DKIM_VALID_AU in X-Spam-Tests, or an
 * Authentication-Results "dkim=pass header.d=<from domain>". A header that appears more than once is ambiguous
 * (a sender could have added their own) and counts as not passing.
 */
function dkimPassed(headers: Header[], fromEmail: string): boolean {
  const fromDomain = fromEmail.split('@')[1] ?? '';
  if (!fromDomain) return false;
  const tests = headerValues(headers, 'X-Spam-Tests');
  if (tests.length === 1 && tests[0].split(/[\s,]+/).includes('DKIM_VALID_AU')) return true;
  const ar = headerValues(headers, 'Authentication-Results');
  if (ar.length !== 1) return false;
  for (const m of ar[0].matchAll(/\bdkim=pass\b[^;]*?header\.d=([^\s;]+)/gi)) {
    if (aligned(fromDomain, m[1])) return true;
  }
  return false;
}

function fromAddress(b: Inbound): string {
  const raw = b.FromFull?.Email || (/<([^>]+)>/.exec(b.From)?.[1] ?? b.From);
  return raw.trim().toLowerCase();
}

function recipientAddresses(b: Inbound): string[] {
  const all = [...b.ToFull.map((a) => a.Email), ...b.CcFull.map((a) => a.Email), b.OriginalRecipient ?? '']
    .map((a) => a.trim().toLowerCase()).filter((a) => a.includes('@'));
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

/** Stores attachments (only for routed mail) and the raw JSON without the base64 bodies. Returns the raw path. */
async function store(service: Db, b: Inbound, routed: boolean): Promise<string> {
  const base = `inbound/${b.MessageID}`;
  const attachments = [];
  for (const [i, a] of b.Attachments.entries()) {
    const { Content, ...meta } = a;
    if (!routed) {
      attachments.push({ ...meta, StoredPath: null, Skipped: 'unrouted' });
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(Content);
    } catch (e) {
      attachments.push({ ...meta, StoredPath: null, Skipped: `undecodable: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    // Index prefix: two attachments may share a name.
    const path = `${base}/${i + 1}-${safeName(a.Name)}`;
    // base64ToBytes allocates a fresh, exactly-sized ArrayBuffer, so the whole buffer is the attachment.
    await put(service, path, new Blob([bytes.buffer as ArrayBuffer], { type: a.ContentType }), a.ContentType);
    attachments.push({ ...meta, StoredPath: path });
  }
  const rawPath = `${base}.json`;
  const raw = JSON.stringify({ ...b, Attachments: attachments });
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
  await requireWebhook(req, 'postmark');
  const b = await parseJson(req, Body, 60 * 1024 * 1024);
  const service = serviceClient();

  const seen = must(
    await service.from('email_inbound').select('id').eq('message_id', b.MessageID).maybeSingle(),
    'dedupe lookup',
  );
  if (seen) return ok(req, { ok: true, duplicate: true });

  const from = fromAddress(b);
  const spf = spfPassed(b.Headers);
  const dkim = dkimPassed(b.Headers, from);
  const r = await route(service, recipientAddresses(b));
  const rawPath = await store(service, b, r.orgId !== null);
  const senderMemberId = r.projectId && spf && dkim ? await matchSender(service, r.projectId, from) : null;

  const inserted = await service.from('email_inbound').insert({
    message_id: b.MessageID,
    org_id: r.orgId,
    project_id: r.projectId,
    to_address: r.toAddress,
    from_email: from || 'unknown',
    from_name: b.FromFull?.Name ?? b.FromName ?? null,
    subject: b.Subject.slice(0, 1000),
    raw_path: rawPath,
    text_body: b.TextBody ? b.TextBody.slice(0, 200_000) : null,
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
        p_payload: { from, subject: b.Subject.slice(0, 300), verified_sender: senderMemberId !== null },
      });
    }
    if (senderMemberId) {
      await enqueue(service, 'sort_inbound_email', { email_inbound_id: inboundId }, r.projectId, `inbound:${b.MessageID}`);
    }
  }

  await audit(service, {
    action: 'email.inbound', actorKind: 'webhook', entityType: 'email_inbound', entityId: inboundId,
    projectId: r.projectId, orgId: r.orgId,
    details: { from, spf_pass: spf, dkim_pass: dkim, verified_sender: senderMemberId !== null, attachments: b.Attachments.length },
  });

  return ok(req, { ok: true, id: inboundId, routed: r.orgId !== null, verified_sender: senderMemberId !== null });
}));
