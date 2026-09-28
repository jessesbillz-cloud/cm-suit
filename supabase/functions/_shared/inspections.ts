// Inspection requests on the server (SPEC §13.2): the one row shape the IR functions read (as the caller), the signed
// content and its hash, and the labels the PDF and the results email print. Pure except loadRequest.
import { type Db, must } from './db.ts';
import { contentHash } from './crypto.ts';
import { HttpError } from './http.ts';
import { z } from './validate.ts';

const irRowSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string(),
  number: z.number().int(),
  version: z.number().int(),
  requested_by: z.string(),
  company: z.string(),
  request_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().nullable(),
  duration_kind: z.enum(['timed', 'all_day', 'periodic']),
  duration_min: z.number().int().nullable(),
  kind: z.enum(['ior', 'special', 'ofs']),
  items: z.string(),
  status: z.string(),
  owner_id: z.string().nullable(),
  result: z.enum(['approved', 'not_approved']).nullable(),
  result_note: z.string().nullable(),
  result_photo_ids: z.array(z.string()),
  ir_file_id: z.string().nullable(),
  content_hash: z.string().nullable(),
  signed_at: z.string().nullable(),
  signed_by: z.string().nullable(),
  pdf_stale: z.boolean(),
  pdf_postponed: z.boolean(),
  postpone_reason: z.string().nullable(),
  postpone_note: z.string().nullable(),
  postpone_until: z.string().nullable(),
  ir_special_kinds: z.object({ name: z.string() }).nullable(),
});
export type IrRow = z.infer<typeof irRowSchema>;

const IR_COLS = 'id, org_id, project_id, number, version, requested_by, company, request_date, start_time, duration_kind, ' +
  'duration_min, kind, items, status, owner_id, result, result_note, result_photo_ids, ir_file_id, content_hash, signed_at, ' +
  'signed_by, pdf_stale, pdf_postponed, postpone_reason, postpone_note, postpone_until, ir_special_kinds(name)';

/** The request AS THE CALLER (RLS): someone who may not see it gets 404. */
export async function loadRequest(client: Db, requestId: string): Promise<IrRow> {
  const row: unknown = must(
    await client.from('inspection_requests').select(IR_COLS).eq('id', requestId).maybeSingle(),
    'inspection request lookup',
  );
  if (row === null) throw new HttpError(404, 'Inspection not found');
  return irRowSchema.parse(row);
}

/**
 * What an IR signs (SPEC §6.9). The same columns the database watches to mark a PDF stale (tg_ir_before), so a change
 * to any of them needs Update PDF and a new signature.
 */
export function irContent(r: IrRow): Record<string, unknown> {
  return {
    number: r.number,
    request_date: r.request_date,
    start_time: r.start_time,
    duration_kind: r.duration_kind,
    duration_min: r.duration_min,
    kind: r.kind,
    special_kind: r.ir_special_kinds?.name ?? null,
    company: r.company,
    items: r.items,
    result: r.result,
    result_note: r.result_note,
    result_photo_ids: r.result_photo_ids,
  };
}

export function irHash(r: IrRow): Promise<string> {
  return contentHash(irContent(r));
}

export function typeLabel(r: Pick<IrRow, 'kind' | 'ir_special_kinds'>): string {
  if (r.kind === 'ior') return 'IOR';
  if (r.kind === 'ofs') return 'OFS';
  return `Special: ${r.ir_special_kinds?.name ?? 'other'}`;
}

/** A calendar day as written ("Thu, Oct 1, 2026"): no instant, so no zone shift. */
export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${day}T00:00:00Z`));
}

/** "Flexible", or "1:30 PM" from "13:30:00". */
export function timeLabel(start: string | null): string {
  if (start === null) return 'Flexible';
  const m = /^(\d{2}):(\d{2})/.exec(start);
  if (!m) throw new Error(`Not a time: ${start}`);
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

export function durationLabel(r: Pick<IrRow, 'duration_kind' | 'duration_min'>): string {
  if (r.duration_kind === 'all_day') return 'All day';
  if (r.duration_kind === 'periodic') return 'Periodic / as needed';
  const min = r.duration_min ?? 0;
  if (min < 60) return `${min} min`;
  const hours = min / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
}

export function resultLabel(result: IrRow['result']): string {
  if (result === 'approved') return 'Approved';
  if (result === 'not_approved') return 'Not approved';
  return 'No result';
}

const POSTPONE_REASONS: Record<string, string> = {
  not_ready: 'Not ready',
  weather: 'Weather',
  gc_requested: 'GC requested',
  other: 'Other',
};

export function postponeLabel(reason: string | null): string {
  return reason === null ? '' : POSTPONE_REASONS[reason] ?? reason;
}

/** The signed time in the job's zone for the stamp, e.g. "Sep 26, 2026, 4:05 PM PDT". */
export function signedAtLabel(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${iso}`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone,
  }).format(d);
}
