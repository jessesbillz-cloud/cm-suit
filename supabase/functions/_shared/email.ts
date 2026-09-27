// Transactional email out through Resend (SPEC §8.4). Transactional mail only; nothing here is marketing or broadcast.
//
// RECIPIENTS ALWAYS COME FROM THE DATABASE. Callers pass `toEmail` read back from a row they looked up themselves
// (project_members.invite_email, a transmittal's stored to_emails, share_links.recipient_email) — never a value taken
// straight from a request body. Every template escapes user text with esc().
//
// The caller passes its service-role client in; this module never creates one.
import { HttpError } from './http.ts';
import { BRAND_NAME, env, envOptional } from './env.ts';
import { type Db, dbError, must } from './db.ts';

const RESEND_URL = 'https://api.resend.com/emails';

export interface EmailInput {
  kind: string;
  projectId: string | null;
  orgId: string | null;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  entityType?: string | null;
  entityId?: string | null;
  replyTo?: string | null;
  tag?: string | null;
  createdBy?: string | null;
}

export type SendStatus = 'sent' | 'test_mode' | 'failed' | 'suppressed';

export interface SendResult {
  outboundId: string;
  status: SendStatus;
  messageId: string | null;
  error: string | null;
}

/** Resend: 200 `{ id }` on success; errors are `{ statusCode, name, message }`. */
interface ResendReply {
  id?: string;
  statusCode?: number;
  name?: string;
  message?: string;
}

interface ResendTag {
  name: string;
  value: string;
}

/** HTML-escapes user-provided text for templates. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** One line, no control characters (subjects, display names). */
function oneLine(s: string, max = 200): string {
  // deno-lint-ignore no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

/** "jesse@lulling.com" → "j***@lulling.com". */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 1) return '***';
  return `${address[0]}***${address.slice(at)}`;
}

function senderHeader(): string {
  const name = BRAND_NAME().replace(/["\\\r\n]/g, '');
  return `"${name}" <${env('EMAIL_FROM')}>`;
}

/** Resend tag names and values allow only ASCII letters, digits, '_' and '-' (max 256). */
function tagValue(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 256) || 'none';
}

function tags(m: EmailInput): ResendTag[] {
  const out: ResendTag[] = [{ name: 'kind', value: tagValue(m.tag ?? m.kind) }];
  if (m.entityType) out.push({ name: 'entity_type', value: tagValue(m.entityType) });
  if (m.entityId) out.push({ name: 'entity_id', value: tagValue(m.entityId) });
  return out;
}

async function finish(service: Db, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await service.from('email_outbound').update({ ...patch, status_at: new Date().toISOString() }).eq('id', id);
  if (error) throw dbError(error, 'email_outbound update');
}

async function resendSend(apiKey: string, from: string, m: EmailInput, to: string): Promise<{ messageId: string | null; error: string | null }> {
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [to],
        subject: oneLine(m.subject),
        html: m.html,
        text: m.text,
        reply_to: m.replyTo ?? undefined,
        tags: tags(m),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { messageId: null, error: `network: ${e instanceof Error ? e.message : String(e)}` };
  }
  const raw = await res.text();
  let reply: ResendReply = {};
  try {
    reply = JSON.parse(raw) as ResendReply;
  } catch (e) {
    return { messageId: null, error: `resend ${res.status}: unreadable reply (${e instanceof Error ? e.message : String(e)}) ${raw.slice(0, 200)}` };
  }
  if (!res.ok || !reply.id) {
    return { messageId: null, error: `resend ${res.status} ${reply.name ?? '?'}: ${reply.message ?? raw.slice(0, 200)}` };
  }
  return { messageId: reply.id, error: null };
}

/**
 * Records an email_outbound row, sends it, and records the outcome. A Resend failure does not throw: it is recorded
 * as status 'failed' and returned, so the caller can show it on the send record and offer the mail-app fallback.
 * Database errors do throw.
 *
 * EMAIL_TEST_MODE=true: nothing is sent (Resend has no delivering-nothing test key); the row is recorded as
 * 'test_mode' so every screen behaves as if it had gone.
 */
export async function sendEmail(service: Db, m: EmailInput): Promise<SendResult> {
  const to = m.toEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, 'Recipient address is not valid');
  const testMode = envOptional('EMAIL_TEST_MODE') === 'true';
  // Read (and refuse on a missing secret) before anything is recorded. EMAIL_FROM is required in test mode too.
  const apiKey = testMode ? null : env('RESEND_API_KEY');
  const from = senderHeader();

  const suppressed = must(
    await service.from('email_suppressions').select('reason').eq('email', to).maybeSingle(),
    'email_suppressions lookup',
  ) as { reason: string } | null;

  const row = must(
    await service.from('email_outbound').insert({
      org_id: m.orgId,
      project_id: m.projectId,
      kind: m.kind,
      to_email: to,
      subject: oneLine(m.subject),
      entity_type: m.entityType ?? null,
      entity_id: m.entityId ?? null,
      created_by: m.createdBy ?? null,
      status: suppressed ? 'failed' : 'queued',
      error: suppressed ? `suppressed: ${suppressed.reason}` : null,
    }).select('id').single(),
    'email_outbound insert',
  ) as { id: string };

  if (suppressed) return { outboundId: row.id, status: 'suppressed', messageId: null, error: `suppressed: ${suppressed.reason}` };

  if (apiKey === null) {
    await finish(service, row.id, { status: 'test_mode' });
    return { outboundId: row.id, status: 'test_mode', messageId: null, error: null };
  }

  const sent = await resendSend(apiKey, from, m, to);
  if (sent.error) {
    console.error(`[email] send failed (${row.id}): ${sent.error}`);
    await finish(service, row.id, { status: 'failed', error: sent.error.slice(0, 2000) });
    return { outboundId: row.id, status: 'failed', messageId: null, error: sent.error };
  }
  await finish(service, row.id, { status: 'sent', provider_message_id: sent.messageId });
  return { outboundId: row.id, status: 'sent', messageId: sent.messageId, error: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Templates. Plain, inline-styled, no images, no emojis. Every interpolated value goes through esc().
// ---------------------------------------------------------------------------------------------------------------------
export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

function layout(brand: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f7f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2328">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
${bodyHtml}
<p style="margin-top:28px;font-size:12px;color:#6b7280">${esc(brand)}. This link is for you only. If you did not expect this email, you can ignore it.</p>
</div></body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${esc(label)}</a></p>`;
}

export function inviteEmail(p: { brand: string; projectName: string; roleLabel: string; linkUrl: string }): Rendered {
  const subject = oneLine(`You're invited to ${p.projectName}`);
  const html = layout(p.brand, `
<h1 style="font-size:20px;margin:0 0 12px">You're invited to ${esc(p.projectName)}</h1>
<p>You've been added as <strong>${esc(p.roleLabel)}</strong>.</p>
<p>Open the link below. We'll email you a 6-digit code to confirm it's you. The link keeps working, so you can use it again later.</p>
${button(p.linkUrl, 'Open the project')}
<p style="font-size:13px;color:#6b7280;word-break:break-all">${esc(p.linkUrl)}</p>`);
  const text = `You're invited to ${p.projectName} as ${p.roleLabel}.

Open this link. We'll email you a 6-digit code to confirm it's you. The link keeps working, so you can use it again later.

${p.linkUrl}

${p.brand}`;
  return { subject, html, text };
}

export interface TransmittalLink {
  name: string;
  url: string;
}

export function transmittalEmail(p: {
  brand: string;
  projectName: string;
  number: number;
  senderName: string;
  subject: string;
  message: string;
  links: TransmittalLink[];
}): Rendered {
  const subject = oneLine(`${p.projectName} - Transmittal ${p.number}: ${p.subject}`);
  const items = p.links.map((l) => `<li style="margin:6px 0"><a href="${esc(l.url)}">${esc(l.name)}</a></li>`).join('');
  const msgHtml = p.message ? `<p style="white-space:pre-wrap">${esc(p.message)}</p>` : '';
  const html = layout(p.brand, `
<h1 style="font-size:20px;margin:0 0 4px">Transmittal ${p.number}</h1>
<p style="margin:0 0 16px;color:#6b7280">${esc(p.projectName)} &middot; from ${esc(p.senderName)}</p>
<p><strong>${esc(p.subject)}</strong></p>
${msgHtml}
<ul style="padding-left:18px">${items}</ul>
<p style="font-size:13px;color:#6b7280">Each link asks for a code sent to this address the first time, then downloads the file with its original name.</p>`);
  const text = `Transmittal ${p.number} - ${p.projectName}
From ${p.senderName}

${p.subject}

${p.message ? `${p.message}\n\n` : ''}${p.links.map((l) => `${l.name}\n${l.url}`).join('\n\n')}

${p.brand}`;
  return { subject, html, text };
}
