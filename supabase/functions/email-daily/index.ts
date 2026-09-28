// "Email to team" for a submitted daily report (SPEC §13.1 submit step 5, §8.1, §8.4). The author presses Send;
// nothing sends on its own. Recipients come from the database (the author's setup for the job,
// daily_setups.settings.recipients), never from the request. Every send is a transmittal, and each recipient gets a
// permanent share link to the report PDF, checked on every click by the public `share` endpoint. A report changed since
// it was signed is refused: an out-of-date PDF is never sent.
//
// Everything is read and checked AS THE CALLER first (the report, its photos, the setup). Service client (listed in
// admin_service_key_allowlist.txt): the transmittal, the share links and email_outbound, which authors without
// transmittals.send can't write themselves.
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { dailyReportEmail, sendEach, sendEmail, type SendStatus } from '../_shared/email.ts';
import { appUrl, BRAND_NAME } from '../_shared/env.ts';
import { dailyHeaderSchema, needsResubmit, parseDailySettings } from '../_shared/dailies.ts';
import { dayLabel } from '../_shared/pdf/dailyReport.ts';

const Body = z.object({ report_id: uuid }).strict();

type Report = {
  id: string;
  org_id: string;
  project_id: string;
  author_id: string;
  report_type: string;
  report_date: string;
  status: string;
  number: number | null;
  header: unknown;
  version: number;
  signed_version: number | null;
  signed_at: string | null;
  pdf_file_id: string | null;
  filename: string | null;
};

const REPORT_COLS = 'id, org_id, project_id, author_id, report_type, report_date, status, number, header, version, signed_version, ' +
  'signed_at, pdf_file_id, filename';

type Delivery = { email: string; status: SendStatus; error: string | null; mailto: string };

function mailto(to: string[], subject: string, body: string): string {
  const addr = to.map((a) => encodeURIComponent(a).replace(/%40/g, '@')).join(',');
  return `mailto:${addr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Recipients who are members of the job: their share links end with their membership. */
async function memberIds(service: Db, projectId: string, emails: string[]): Promise<Map<string, string>> {
  const rows = must(
    await service.from('project_members').select('id, invite_email').eq('project_id', projectId).in('invite_email', emails)
      .neq('status', 'revoked'),
    'member lookup',
  ) as { id: string; invite_email: string }[];
  return new Map(rows.map((r) => [r.invite_email, r.id]));
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);

  const report = must(
    await client.from('daily_reports').select(REPORT_COLS).eq('id', body.report_id).is('deleted_at', null).maybeSingle(),
    'report lookup',
  ) as Report | null;
  if (!report) throw new HttpError(404, 'Report not found');
  if (report.author_id !== user.id) throw new HttpError(403, 'Only its author sends a report');
  await requireCapability(client, report.project_id, 'dailies.write');
  if (report.status !== 'submitted' || !report.pdf_file_id || report.number === null) {
    return refuse(req, 409, 'not_submitted', 'Submit the report first');
  }
  const photos = must(
    await client.from('daily_report_photos').select('updated_at').eq('report_id', report.id),
    'photo lookup',
  ) as { updated_at: string }[];
  if (needsResubmit(report, photos)) return refuse(req, 409, 'stale', 'Changed since it was signed. Update & resubmit first.');

  const setup = must(
    await client.from('daily_setups').select('settings').eq('project_id', report.project_id).eq('author_id', user.id)
      .eq('report_type', report.report_type).maybeSingle(),
    'setup lookup',
  ) as { settings: unknown } | null;
  const recipients = parseDailySettings(setup?.settings).recipients;
  if (recipients.length === 0) return refuse(req, 400, 'no_recipients', 'Add recipients in Setup');

  const header = dailyHeaderSchema.parse(report.header);
  const title = `${header.label} #${report.number}`;
  const dateLabel = dayLabel(report.report_date);
  const fileName = report.filename ?? `${title}.pdf`;

  const service = serviceClient();
  const number = await rpc<number>(service, 'next_number', { p_project_id: report.project_id, p_kind: 'transmittal' });
  const members = await memberIds(service, report.project_id, recipients);
  const transmittal = must(
    await service.from('transmittals').insert({
      org_id: report.org_id,
      project_id: report.project_id,
      number,
      from_user: user.id,
      to_emails: recipients,
      to_members: [...members.values()],
      file_ids: [report.pdf_file_id],
      subject: `${title} (${dateLabel})`,
      message: '',
      created_by: user.id,
    }).select('id').single(),
    'transmittal insert',
  ) as { id: string };

  const links = must(
    await service.from('share_links').insert(recipients.map((to) => ({
      created_by: user.id,
      org_id: report.org_id,
      project_id: report.project_id,
      target_type: 'file',
      target_id: report.pdf_file_id,
      recipient_email: to,
      member_id: members.get(to) ?? null,
    }))).select('id, recipient_email'),
    'share_links insert',
  ) as { id: string; recipient_email: string }[];
  const linkFor = new Map(links.map((l) => [l.recipient_email, l.id]));

  const origin = appUrl();
  const brand = BRAND_NAME();
  const deliveries: Delivery[] = [];
  let firstMessageId: string | null = null;
  await sendEach(recipients, async (to) => {
    const msg = dailyReportEmail({
      brand, projectName: header.project_name, title, dateLabel, authorName: header.author_name, fileName,
      linkUrl: `${origin}/s/${linkFor.get(to) ?? ''}`,
    });
    const sent = await sendEmail(service, {
      kind: 'daily_report', projectId: report.project_id, orgId: report.org_id, toEmail: to,
      subject: msg.subject, html: msg.html, text: msg.text, entityType: 'daily_report', entityId: report.id,
      tag: 'daily_report', createdBy: user.id, replyTo: user.email ?? null,
    });
    firstMessageId ??= sent.messageId;
    deliveries.push({ email: to, status: sent.status, error: sent.error, mailto: mailto([to], msg.subject, msg.text) });
  });

  const anySent = deliveries.some((d) => d.status === 'sent' || d.status === 'test_mode');
  const { error: updError } = await service.from('transmittals').update({
    sent_at: new Date().toISOString(),
    share_link_ids: links.map((l) => l.id),
    delivery_status: anySent ? 'sent' : 'failed',
    provider_message_id: firstMessageId,
  }).eq('id', transmittal.id);
  if (updError) throw new HttpError(500, `transmittal update: ${updError.message}`);

  return ok(req, {
    transmittal_id: transmittal.id,
    delivery_status: anySent ? 'sent' : 'failed',
    recipients,
    deliveries,
  });
}));
