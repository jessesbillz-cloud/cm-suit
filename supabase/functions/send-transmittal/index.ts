// Send files by email (SPEC §8.1, §8.4). Every send creates a transmittal; each recipient gets their own permanent
// share links (one per file), checked on every click by the public `share` endpoint.
//
// Authorization: create_transmittal() runs as the caller (user client) and checks transmittals.send plus each file
// (same project, clean scan, readable). share_links are inserted as the caller too (RLS insert policy).
// Service client: sending mail (email_outbound is not user-writable) and the final transmittal update (no user update
// policy on transmittals). Listed in admin_service_key_allowlist.txt for that reason.
//
// Recipients come from the database: the transmittal row's stored to_emails (written by create_transmittal) and the
// project_members rows the caller can see, never directly from the request body.
import { handle, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { email, parseJson, uuid, z } from '../_shared/validate.ts';
import { sendEmail, type SendStatus, transmittalEmail } from '../_shared/email.ts';
import { BRAND_NAME, appUrl } from '../_shared/env.ts';

const Body = z.object({
  project_id: uuid,
  to_emails: z.array(email).max(50).default([]),
  to_member_ids: z.array(uuid).max(50).default([]),
  file_ids: z.array(uuid).min(1).max(100),
  subject: z.string().trim().min(1).max(200),
  message: z.string().max(5000).default(''),
}).strict().refine((b) => b.to_emails.length + b.to_member_ids.length > 0, { message: 'Add at least one recipient' });

interface Transmittal {
  id: string;
  org_id: string;
  project_id: string;
  number: number;
  to_emails: string[] | null;
  to_members: string[] | null;
  file_ids: string[];
}

interface Delivery {
  email: string;
  status: SendStatus;
  error: string | null;
  mailto: string;
}

function mailto(to: string[], subject: string, body: string): string {
  const addr = to.map((a) => encodeURIComponent(a).replace(/%40/g, '@')).join(',');
  return `mailto:${addr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function memberEmails(client: Db, projectId: string, ids: string[]): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  if (ids.length === 0) return byEmail;
  const rows = must(
    await client.from('project_members').select('id, invite_email, status')
      .eq('project_id', projectId).in('id', ids).neq('status', 'revoked'),
    'member lookup',
  ) as { id: string; invite_email: string }[];
  if (rows.length !== new Set(ids).size) throw new HttpError(400, 'One or more members are unknown or no longer on the project');
  for (const r of rows) byEmail.set(r.invite_email, r.id);
  return byEmail;
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 64 * 1024);
  await requireCapability(client, body.project_id, 'transmittals.send');

  const members = await memberEmails(client, body.project_id, body.to_member_ids);
  const allEmails = [...new Set([...body.to_emails, ...members.keys()])];
  if (allEmails.length * body.file_ids.length > 2000) throw new HttpError(400, 'Too many recipients x files in one send');

  // create_transmittal stores lower(to_emails); member addresses are included so to_emails is the full send list.
  const t = await rpc<Transmittal>(client, 'create_transmittal', {
    p_project_id: body.project_id,
    p_to_emails: allEmails,
    p_to_members: [...members.values()],
    p_file_ids: body.file_ids,
    p_subject: body.subject,
    p_message: body.message,
  });
  const recipients = [...new Set(t.to_emails ?? [])];

  const files = must(
    await client.from('files').select('id, original_name').eq('project_id', t.project_id).in('id', t.file_ids),
    'file lookup',
  ) as { id: string; original_name: string }[];
  if (files.length !== new Set(t.file_ids).size) throw new HttpError(403, 'One or more files are not readable');

  const links = must(
    await client.from('share_links').insert(
      recipients.flatMap((to) => files.map((f) => ({
        created_by: user.id,
        org_id: t.org_id,
        project_id: t.project_id,
        target_type: 'file',
        target_id: f.id,
        recipient_email: to,
        member_id: members.get(to) ?? null,
      }))),
    ).select('id, target_id, recipient_email'),
    'share_links insert',
  ) as { id: string; target_id: string; recipient_email: string }[];

  const profile = must(
    await client.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
    'profile lookup',
  ) as { full_name: string } | null;
  const project = must(
    await client.from('projects').select('name').eq('id', t.project_id).single(),
    'project lookup',
  ) as { name: string };

  const service = serviceClient();
  const origin = appUrl();
  const brand = BRAND_NAME();
  const nameOf = new Map(files.map((f) => [f.id, f.original_name]));
  const deliveries: Delivery[] = [];
  let firstMessageId: string | null = null;

  for (const to of recipients) {
    const mine = links.filter((l) => l.recipient_email === to)
      .map((l) => ({ name: nameOf.get(l.target_id) ?? 'File', url: `${origin}/s/${l.id}` }));
    const msg = transmittalEmail({
      brand, projectName: project.name, number: t.number, senderName: profile?.full_name || user.email || 'A project member',
      subject: body.subject, message: body.message, links: mine,
    });
    const sent = await sendEmail(service, {
      kind: 'transmittal', projectId: t.project_id, orgId: t.org_id, toEmail: to,
      subject: msg.subject, html: msg.html, text: msg.text,
      entityType: 'transmittal', entityId: t.id, tag: 'transmittal', createdBy: user.id,
      replyTo: user.email ?? null,
    });
    firstMessageId ??= sent.messageId;
    deliveries.push({ email: to, status: sent.status, error: sent.error, mailto: mailto([to], msg.subject, msg.text) });
  }

  const anySent = deliveries.some((d) => d.status === 'sent' || d.status === 'test_mode');
  const { error: updError } = await service.from('transmittals').update({
    sent_at: new Date().toISOString(),
    share_link_ids: links.map((l) => l.id),
    delivery_status: anySent ? 'sent' : 'failed',
    postmark_message_id: firstMessageId,
  }).eq('id', t.id);
  if (updError) throw new HttpError(500, `transmittal update: ${updError.message}`);

  return ok(req, {
    transmittal_id: t.id,
    number: t.number,
    delivery_status: anySent ? 'sent' : 'failed',
    recipients,
    deliveries,
    // Share links are per recipient, so the combined fallback carries the message only; per-recipient mailtos carry links.
    mailto: mailto(recipients, `${project.name} - Transmittal ${t.number}: ${body.subject}`, body.message),
  });
}));
