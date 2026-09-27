// Sign and issue an addendum (SPEC §11.5, §6.9). Service client only for reading bidder addresses and sending mail
// (bidders are hidden from the caller's member list by design); listed in admin_service_key_allowlist.txt.
//
// Order: requireUser → load the addendum AS THE CALLER (RLS; unseen = 404) → requireCapability('bids.manage') →
// identity re-confirmation → content hash → issue_addendum() as the caller (numbering was fixed at draft time; the
// RPC stamps signed_at/signed_by/issued_at, audits with the hash and creates the ack tasks) → only then the service
// client, to email every bidder. Calling it again for an issued addendum returns the row and sends nothing.
//
// Re-confirmation, Phase 1: a fresh sign-in within 5 minutes (signedInRecently). Otherwise 403 reauth_required and
// the client runs the email-code sign-in again, then retries. `confirm_code` is accepted for the Phase 2 TOTP/email
// code path and is not yet checked, so it never substitutes for the fresh sign-in.
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser, signedInRecently } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { addendumEmail, sendEach, sendEmail } from '../_shared/email.ts';
import { BRAND_NAME, appUrl } from '../_shared/env.ts';
import { contentHash } from '../_shared/crypto.ts';

const Body = z.object({
  addendum_id: uuid,
  confirm_code: z.string().regex(/^\d{6}$/).optional(),
}).strict();

/** A type alias (not an interface) so it is assignable to http.ts Json. */
type Addendum = {
  id: string;
  org_id: string;
  project_id: string;
  number: number;
  title: string;
  body: string;
  file_ids: string[];
  content_hash: string | null;
  signed_at: string | null;
  signed_by: string | null;
  issued_at: string | null;
  version: number;
};

const ADDENDUM_COLS = 'id, org_id, project_id, number, title, body, file_ids, content_hash, signed_at, signed_by, issued_at, version';

/** SPEC §6.9 content hash: sha256 hex of canonical {number, title, body, file_ids}. */
function hashOf(a: Pick<Addendum, 'number' | 'title' | 'body' | 'file_ids'>): Promise<string> {
  return contentHash({ number: a.number, title: a.title, body: a.body, file_ids: a.file_ids ?? [] });
}

/** Every live bidder address on the project (invited or active, access not ended). Role from role_permissions. */
async function bidderAddresses(service: Db, projectId: string): Promise<{ id: string; invite_email: string }[]> {
  const roles = (must(await service.from('role_permissions').select('role').eq('capability', 'bids.submit'), 'bidder roles') as
    { role: string }[]).map((r) => r.role);
  if (!roles.length) return [];
  const rows = must(
    await service.from('project_members').select('id, invite_email, access_ends_at').eq('project_id', projectId)
      .in('role', roles).in('status', ['invited', 'active']),
    'bidder lookup',
  ) as { id: string; invite_email: string; access_ends_at: string | null }[];
  const now = Date.now();
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (r.access_ends_at && Date.parse(r.access_ends_at) <= now) return false;
    if (seen.has(r.invite_email)) return false;
    seen.add(r.invite_email);
    return true;
  });
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);

  const draft = must(
    await client.from('addenda').select(ADDENDUM_COLS).eq('id', body.addendum_id).is('deleted_at', null).maybeSingle(),
    'addendum lookup',
  ) as Addendum | null;
  if (!draft) throw new HttpError(404, 'Addendum not found');
  await requireCapability(client, draft.project_id, 'bids.manage');
  if (draft.issued_at) return ok(req, draft);

  if (!signedInRecently(user, req)) {
    return refuse(req, 403, 'reauth_required', 'Sign in again to sign this addendum');
  }

  const hash = await hashOf(draft);
  const issued = await rpc<Addendum>(client, 'issue_addendum', { p_addendum_id: draft.id, p_content_hash: hash });
  // A draft edit racing between our read and the RPC would bind the hash to stale content. issue_addendum doesn't take
  // an expected version, so check after the fact and fail loudly (logged with an error ID) rather than mail it out.
  if (issued.content_hash !== (await hashOf(issued))) {
    throw new HttpError(500, `addendum ${issued.id}: content changed while signing; stored hash does not match issued content`);
  }

  const project = must(
    await client.from('projects').select('name').eq('id', issued.project_id).single(),
    'project lookup',
  ) as { name: string };

  const service = serviceClient();
  const recipients = await bidderAddresses(service, issued.project_id);
  const brand = BRAND_NAME();
  const linkUrl = `${appUrl()}/p/${issued.project_id}/bids`;
  const msg = addendumEmail({ brand, projectName: project.name, number: issued.number, title: issued.title, linkUrl });
  await sendEach(recipients, async (r) => {
    await sendEmail(service, {
      kind: 'addendum', projectId: issued.project_id, orgId: issued.org_id, toEmail: r.invite_email,
      subject: msg.subject, html: msg.html, text: msg.text, entityType: 'addendum', entityId: issued.id,
      tag: 'addendum', createdBy: user.id, replyTo: user.email ?? null,
    });
  });

  return ok(req, issued);
}));
