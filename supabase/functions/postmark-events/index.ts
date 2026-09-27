// PUBLIC ENDPOINT (SPEC §6.4 #6): Postmark delivery / bounce / spam / open webhook.
//
// Why public: Postmark calls it server-to-server without a Supabase session. It is gated by requireWebhook (Basic
// Auth credentials in the webhook URL + a secret header, constant-time) and de-duplicated on (MessageID, RecordType)
// by the unique constraint on postmark_events: a duplicate webhook is acknowledged with 200 and ignored.
// Service role: webhooks have no user; nothing here is readable by the caller.
import { handlePublic, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, serviceClient } from '../_shared/db.ts';
import { requireWebhook } from '../_shared/auth.ts';
import { parseJson, z } from '../_shared/validate.ts';

const Body = z.object({
  RecordType: z.string().min(1).max(40),
  MessageID: z.string().min(1).max(200),
  Type: z.string().max(60).optional(), // Bounce type
  Email: z.string().max(320).optional(), // Bounce / SpamComplaint
  Recipient: z.string().max(320).optional(), // Delivery / Open
  FirstOpen: z.boolean().optional(),
  ReceivedAt: z.string().optional(),
  DeliveredAt: z.string().optional(),
  BouncedAt: z.string().optional(),
}).passthrough();
type Event = z.output<typeof Body>;

type OutStatus = 'queued' | 'sent' | 'delivered' | 'bounced' | 'spam' | 'failed' | 'test_mode';

// Bounce records that don't mean "not delivered" (delays, auto-replies, list management).
const NON_FAILURE_BOUNCES = new Set(['Transient', 'AutoResponder', 'AddressChange', 'Subscribe', 'Unsubscribe', 'ChallengeVerification']);

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
  switch (e.RecordType) {
    case 'Delivery':
      return ['queued', 'sent', 'test_mode'].includes(current) ? 'delivered' : null;
    case 'Bounce':
      if (NON_FAILURE_BOUNCES.has(e.Type ?? '')) return null;
      return current === 'spam' ? null : 'bounced';
    case 'SpamComplaint':
      return 'spam';
    default:
      return null;
  }
}

function eventTime(e: Event): string {
  return e.DeliveredAt ?? e.BouncedAt ?? e.ReceivedAt ?? new Date().toISOString();
}

async function suppress(service: Db, e: Event, fallbackEmail: string | null): Promise<void> {
  const hard = (e.RecordType === 'Bounce' && e.Type === 'HardBounce') || e.RecordType === 'SpamComplaint';
  const address = (e.Email ?? fallbackEmail ?? '').trim().toLowerCase();
  if (!hard || !address) return;
  const { error } = await service.from('email_suppressions')
    .upsert({ email: address, reason: e.RecordType === 'SpamComplaint' ? 'spam_complaint' : 'hard_bounce' },
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
  const status = has('spam') ? 'spam' : has('bounced') ? 'bounced' : rows.every((r) => r.status === 'delivered') ? 'delivered' : 'sent';
  const opened = rows.map((r) => r.first_opened_at).filter((v): v is string => !!v).sort()[0] ?? null;
  const { error } = await service.from('transmittals')
    .update({ delivery_status: status, first_opened_at: opened }).eq('id', transmittalId);
  if (error) throw new HttpError(500, `transmittal status update: ${error.message}`);
}

/** Updates email_outbound / transmittal status and suppressions. Returns whether the message is one of ours. */
async function apply(service: Db, e: Event): Promise<boolean> {
  const out = must(
    await service.from('email_outbound').select('id, to_email, status, first_opened_at, entity_type, entity_id')
      .eq('postmark_message_id', e.MessageID).maybeSingle(),
    'email_outbound lookup',
  ) as OutboundRow | null;

  await suppress(service, e, out?.to_email ?? null);
  // Not ours (e.g. Supabase Auth code emails sent over SMTP): the event is stored, nothing to update.
  if (!out) return false;

  const patch: Record<string, unknown> = {};
  const status = nextStatus(out.status, e);
  if (status && status !== out.status) Object.assign(patch, { status, status_at: eventTime(e) });
  if (e.RecordType === 'Open' && !out.first_opened_at) patch.first_opened_at = e.ReceivedAt ?? new Date().toISOString();
  if (Object.keys(patch).length > 0) {
    const { error } = await service.from('email_outbound').update(patch).eq('id', out.id);
    if (error) throw new HttpError(500, `email_outbound update: ${error.message}`);
  }
  if (out.entity_type === 'transmittal' && out.entity_id) await rollUpTransmittal(service, out.entity_id);
  return true;
}

Deno.serve(handlePublic(async (req) => {
  await requireWebhook(req, 'postmark');
  const e = await parseJson(req, Body, 512 * 1024);
  const service = serviceClient();

  const inserted = await service.from('postmark_events')
    .insert({ message_id: e.MessageID, record_type: e.RecordType, payload: e }).select('id').single();
  if (inserted.error) {
    if (inserted.error.code === '23505') return ok(req, { ok: true, duplicate: true });
    throw new HttpError(500, `postmark_events insert: ${inserted.error.message}`);
  }

  try {
    return ok(req, { ok: true, matched: await apply(service, e) });
  } catch (err) {
    // Undo the dedupe row so Postmark's retry is processed instead of being ignored as a duplicate.
    const { error } = await service.from('postmark_events').delete().eq('id', (inserted.data as { id: number }).id);
    if (error) console.error('[postmark-events] could not remove dedupe row after failure', error.message);
    throw err;
  }
}));
