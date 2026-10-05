// Send results (SPEC §13.2, §18.4 P1): the ONE results email. A person picks the recipients and presses Send; nothing
// sends on its own. Signed-in users only. Who sends: whoever decides THIS request now and owns it: the holder of
// ir.ofs_decide on an OFS request sent to OFS, the holder of ir.decide on every other request (decideCapability in
// _shared/inspections.ts, the database's ir_decide_cap; ir_recipients applies the same rule to the picker).
//
// requireUser → load the request AS THE CALLER → requireCapability(decideCapability(row)) → the caller owns it → a
// current, signed PDF (complete, not stale) → the recipients: members' addresses read AS THE CALLER from project_members
// (ids from the picker), the link requester's address read from the request row (0055; the body only says "include
// them"), and up to 10 addresses the sender typed in the picker (MDR's add-an-address). Nothing is sent to anyone the
// sender did not see checked when they pressed Send → create_transmittal() and the share links as the caller (every send
// is a transmittal; the IR goes as a permanent share link) → the emails (service client: email_outbound is not
// user-writable) → the transmittal's delivery fields (service client: no user update policy) → ir_mark_sent() (service
// role only, so "results sent" always means an email went: send time, audit with the content hash, board lines).
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { email, parseJson, uuid, z } from '../_shared/validate.ts';
import { irResultsEmail, sendEach, sendEmail, type SendStatus } from '../_shared/email.ts';
import { BRAND_NAME, appUrl } from '../_shared/env.ts';
import { dayLabel, decideCapability, loadRequest, resultLabel, typeLabel } from '../_shared/inspections.ts';

const Body = z.object({
  request_id: uuid,
  member_ids: z.array(uuid).max(50),
  /** The request's own link requester (its row's email), checked in the picker. */
  requester: z.boolean().default(false),
  /** Addresses the sender typed. */
  emails: z.array(email).max(10).default([]),
}).strict().refine((b) => b.member_ids.length > 0 || b.requester || b.emails.length > 0, { message: 'Pick at least one recipient' });

interface Member {
  id: string;
  user_id: string | null;
  invite_email: string;
}

interface Delivery {
  email: string;
  status: SendStatus;
  error: string | null;
}

function mailto(to: string[], subject: string, body: string): string {
  const addr = to.map((a) => encodeURIComponent(a).replace(/%40/g, '@')).join(',');
  return `mailto:${addr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The link requester's address, from the row as the caller reads it (0055); refused when the request has none. */
async function requesterEmail(client: Db, requestId: string): Promise<string> {
  const row = must(
    await client.from('inspection_requests').select('requester_email').eq('id', requestId).single(),
    'requester lookup',
  ) as { requester_email: string | null };
  if (!row.requester_email) throw new HttpError(400, 'This request has no requester email');
  return row.requester_email;
}

async function membersOf(client: Db, projectId: string, ids: string[]): Promise<Member[]> {
  if (ids.length === 0) return [];
  const rows = must(
    await client.from('project_members').select('id, user_id, invite_email')
      .eq('project_id', projectId).in('id', ids).eq('status', 'active'),
    'member lookup',
  ) as Member[];
  if (rows.length !== new Set(ids).size) throw new HttpError(400, 'One or more people are no longer on this job');
  return rows;
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 8192);

  const row = await loadRequest(client, body.request_id);
  await requireCapability(client, row.project_id, decideCapability(row));
  if (row.owner_id !== user.id) throw new HttpError(403, 'Only the person who owns this IR sends its results');
  if (row.status !== 'complete' || !row.ir_file_id || row.pdf_stale) {
    return refuse(req, 409, 'not_ready', 'Generate the IR first.');
  }
  const fileId = row.ir_file_id;

  const members = await membersOf(client, row.project_id, body.member_ids);
  const outside = [...(body.requester ? [await requesterEmail(client, row.id)] : []), ...body.emails];
  const emails = [...new Set([...members.map((m) => m.invite_email), ...outside])];
  // A typed or requester address that is a member's goes as the member (their own share link, revoked with them).
  const memberOf = (to: string) => members.find((m) => m.invite_email === to);
  const t = await rpc<{ id: string; org_id: string; number: number }>(client, 'create_transmittal', {
    p_project_id: row.project_id,
    p_to_emails: emails,
    p_to_members: members.map((m) => m.id),
    p_file_ids: [fileId],
    p_subject: `IR ${row.number} ${resultLabel(row.result)}`,
    p_message: '',
  });
  const links = must(
    await client.from('share_links').insert(emails.map((to) => ({
      created_by: user.id, org_id: t.org_id, project_id: row.project_id, target_type: 'file', target_id: fileId,
      recipient_email: to, member_id: memberOf(to)?.id ?? null,
    }))).select('id, recipient_email'),
    'share_links insert',
  ) as { id: string; recipient_email: string }[];
  const project = must(await client.from('projects').select('name').eq('id', row.project_id).single(), 'project lookup') as
    { name: string };

  const service = serviceClient();
  const origin = appUrl();
  const brand = BRAND_NAME();
  const itemUrl = `${origin}/p/${row.project_id}/inspections/${row.id}`;
  const deliveries: Delivery[] = [];
  let firstMessageId: string | null = null;
  await sendEach(emails, async (to) => {
    const link = links.find((l) => l.recipient_email === to);
    if (!link) throw new HttpError(500, `no share link for ${to}`);
    const msg = irResultsEmail({
      brand, projectName: project.name, number: row.number, typeLabel: typeLabel(row), resultLabel: resultLabel(row.result),
      dayLabel: dayLabel(row.request_date), company: row.company, pdfUrl: `${origin}/s/${link.id}`, itemUrl,
    });
    const sent = await sendEmail(service, {
      kind: 'ir_results', projectId: row.project_id, orgId: row.org_id, toEmail: to, subject: msg.subject, html: msg.html,
      text: msg.text, entityType: 'inspection_request', entityId: row.id, tag: 'ir_results', createdBy: user.id,
      replyTo: user.email ?? null,
    });
    firstMessageId ??= sent.messageId;
    deliveries.push({ email: to, status: sent.status, error: sent.error });
  });

  const anySent = deliveries.some((d) => d.status === 'sent' || d.status === 'test_mode');
  const { error: updError } = await service.from('transmittals').update({
    sent_at: new Date().toISOString(),
    share_link_ids: links.map((l) => l.id),
    delivery_status: anySent ? 'sent' : 'failed',
    provider_message_id: firstMessageId,
  }).eq('id', t.id);
  if (updError) throw new HttpError(500, `transmittal update: ${updError.message}`);

  if (anySent) {
    await rpc(service, 'ir_mark_sent', {
      p_request_id: row.id,
      p_transmittal_id: t.id,
      p_recipient_ids: members.flatMap((m) => (m.user_id ? [m.user_id] : [])),
    });
  }

  return ok(req, {
    delivery_status: anySent ? 'sent' : 'failed',
    deliveries,
    recipients: emails,
    mailto: mailto(emails, `${project.name} - IR ${row.number} ${resultLabel(row.result)}`, itemUrl),
  });
}));
