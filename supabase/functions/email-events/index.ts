// PUBLIC ENDPOINT (SPEC §6.4 #6): Resend delivery / bounce / complaint / open webhook.
//
// Why public: Resend calls it server-to-server without a Supabase session. It is gated by requireWebhook (Svix
// HMAC signature over the raw body + a 5-minute timestamp window, constant-time) and de-duplicated on the svix-id
// header by the unique constraint on email_events.event_id: a duplicate webhook is acknowledged with 200 and ignored.
// Service role: webhooks have no user; nothing here is readable by the caller.
import { handlePublic, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, serviceClient } from '../_shared/db.ts';
import { requireWebhook } from '../_shared/auth.ts';
import { parseText, readBody, z } from '../_shared/validate.ts';

const Body = z.object({
  type: z.string().min(1).max(60),
  created_at: z.string().max(60).optional(),
  data: z.object({
    // Absent on non-email events (domain.*, contact.*) if those are ever subscribed: stored, nothing to update.
    email_id: z.string().min(1).max(200).optional(),
    to: z.array(z.string().max(320)).max(100).default([]),
    subject: z.string().max(2000).optional(),
    bounce: z.object({
      type: z.string().max(60).optional(), // 'Permanent' | 'Transient' | 'Undetermined'
      subType: z.string().max(120).optional(),
      message: z.string().max(4000).optional(),
    }).passthrough().optional(),
  }).passthrough(),
}).passthrough();
type Event = z.output<typeof Body>;

type OutStatus = 'queued' | 'sent' | 'delivered' | 'bounced' | 'spam' | 'failed' | 'test_mode';

interface OutboundRow {
  id: string;
  to_email: string;
  status: OutStatus;
  first_opened_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

/** New status for the email, or null to leave it. Never downgrades a bounce/spam back to delivered. */
function nextStatus(current: OutStatus, e: Event): OutStatus | null {
  switch (e.type) {
    case 'email.sent':
      return current === 'queued' ? 'sent' : null;
    case 'email.delivered':
      return ['queued', 'sent', 'test_mode'].includes(current) ? 'delivered' : null;
    case 'email.bounced':
      // A transient bounce is a delay, not a failure (Resend keeps retrying).
      if (e.data.bounce?.type === 'Transient') return null;
      return current === 'spam' ? null : 'bounced';
    case 'email.complained':
      return 'spam';
    case 'email.failed':
      return ['queued', 'sent'].includes(current) ? 'failed' : null;
    default:
      // email.delivery_delayed, email.opened, email.clicked: no status change.
      return null;
  }
}

function eventTime(e: Event): string {
  return e.created_at ?? new Date().toISOString();
}

async function suppress(service: Db, e: Event, fallbackEmail: string | null): Promise<void> {
  const permanentBounce = e.type === 'email.bounced' && e.data.bounce?.type === 'Permanent';
  const complaint = e.type === 'email.complained';
  if (!permanentBounce && !complaint) return;
  // Our sends have exactly one recipient. For anything else, suppress only when the event names a single recipient,
  // so one bad address never suppresses the others on the same message.
  const address = (fallbackEmail ?? (e.data.to.length === 1 ? e.data.to[0] : '')).trim().toLowerCase();
  if (!address) return;
  const { error } = await service.from('email_suppressions')
    .upsert({ email: address, reason: complaint ? 'spam_complaint' : 'hard_bounce' },
      { onConflict: 'email', ignoreDuplicates: true });
  if (error) throw new HttpError(500, `email_suppressions upsert: ${error.message}`);
}

/** A transmittal's single status summarizes all its recipients' emails. */
async function rollUpTransmittal(service: Db, transmittalId: string): Promise<void> {
  const rows = must(
    await service.from('email_outbound').select('status, first_opened_at')
      .eq('entity_type', 'transmittal').eq('entity_id', transmittalId),
    'transmittal emails',
  ) as { status: OutStatus; first_opened_at: string | null }[];
  if (rows.length === 0) return;
  const has = (s: OutStatus) => rows.some((r) => r.status === s);
  const every = (s: OutStatus) => rows.every((r) => r.status === s);
  const status = has('spam') ? 'spam' : has('bounced') ? 'bounced' : every('delivered') ? 'delivered' : every('failed') ? 'failed' : 'sent';
  const opened = rows.map((r) => r.first_opened_at).filter((v): v is string => !!v).sort()[0] ?? null;
  const { error } = await service.from('transmittals')
    .update({ delivery_status: status, first_opened_at: opened }).eq('id', transmittalId);
  if (error) throw new HttpError(500, `transmittal status update: ${error.message}`);
}

/** Updates email_outbound / transmittal status and suppressions. Returns whether the message is one of ours. */
async function apply(service: Db, e: Event): Promise<boolean> {
  if (!e.data.email_id) return false;
  const out = must(
    await service.from('email_outbound').select('id, to_email, status, first_opened_at, entity_type, entity_id')
      .eq('provider_message_id', e.data.email_id).maybeSingle(),
    'email_outbound lookup',
  ) as OutboundRow | null;

  await suppress(service, e, out?.to_email ?? null);
  // Not ours (e.g. Supabase Auth code emails sent over Resend SMTP): the event is stored, nothing to update.
  if (!out) return false;

  const patch: Record<string, unknown> = {};
  const status = nextStatus(out.status, e);
  if (status && status !== out.status) Object.assign(patch, { status, status_at: eventTime(e) });
  if (e.type === 'email.bounced' && e.data.bounce?.message && status === 'bounced') {
    patch.error = `bounce: ${e.data.bounce.subType ?? e.data.bounce.type ?? ''} ${e.data.bounce.message}`.slice(0, 2000);
  }
  if (e.type === 'email.opened' && !out.first_opened_at) patch.first_opened_at = eventTime(e);
  if (Object.keys(patch).length > 0) {
    const { error } = await service.from('email_outbound').update(patch).eq('id', out.id);
    if (error) throw new HttpError(500, `email_outbound update: ${error.message}`);
  }
  if (out.entity_type === 'transmittal' && out.entity_id) await rollUpTransmittal(service, out.entity_id);
  return true;
}

Deno.serve(handlePublic(async (req) => {
  // Read the body once: the signature covers these exact bytes, and it is parsed only after the check passes.
  const raw = await readBody(req, 512 * 1024);
  const { eventId } = await requireWebhook(req, 'resend', raw);
  const e = parseText(raw, Body);
  const service = serviceClient();

  const inserted = await service.from('email_events')
    .insert({ event_id: eventId, event_type: e.type, payload: e }).select('id').single();
  if (inserted.error) {
    if (inserted.error.code === '23505') return ok(req, { ok: true, duplicate: true });
    throw new HttpError(500, `email_events insert: ${inserted.error.message}`);
  }

  try {
    return ok(req, { ok: true, matched: await apply(service, e) });
  } catch (err) {
    // Undo the dedupe row so Resend's retry is processed instead of being ignored as a duplicate.
    const { error } = await service.from('email_events').delete().eq('id', (inserted.data as { id: number }).id);
    if (error) console.error('[email-events] could not remove dedupe row after failure', error.message);
    throw err;
  }
}));
