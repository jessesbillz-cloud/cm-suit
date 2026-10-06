// Inspection shapes the app reads (SPEC §13.2). Table rows derive from the generated types; RPC answers whose columns
// the generator types as non-null (the calendar, the form context JSON) and the edge-function answers are parsed with
// zod at the boundary, so a changed contract fails loudly here.
import { z } from 'zod';
import type { Database, Tables } from './database.types';

type Fns = Database['public']['Functions'];

export type DurationKind = 'timed' | 'all_day' | 'periodic';
export type IrKind = 'ior' | 'special' | 'ofs';

/**
 * One line of the job's inspection calendar (calendar_inspections, 0061; the outsider's day is shaped like it): in full
 * for my own and for the GC team / inspectors, and for the deputy his OFS requests; others' carry time, type and color.
 */
export const calendarRowSchema = z.object({
  id: z.string().nullable(),
  number: z.number().nullable(),
  version: z.number().nullable(),
  full_detail: z.boolean(),
  mine: z.boolean(),
  is_block: z.boolean(),
  request_date: z.string(),
  start_time: z.string().nullable(),
  duration_kind: z.string(),
  duration_min: z.number().nullable(),
  kind: z.string(),
  special_kind: z.string().nullable(),
  status: z.string(),
  status_key: z.string(),
  result: z.string().nullable(),
  attendance: z.string().nullable(),
  company: z.string().nullable(),
  items: z.string().nullable(),
  owner_id: z.string().nullable(),
  helper_id: z.string().nullable(),
  postpone_reason: z.string().nullable(),
  postpone_until: z.string().nullable(),
  /** An OFS request the inspector has sent to OFS (false on a line I don't read in full). */
  ofs_sent: z.boolean(),
});
export type CalendarRow = z.infer<typeof calendarRowSchema>;

export const formContextSchema = z.object({
  gc: z.string().nullable(),
  inspectors: z.array(z.string()),
  gc_step: z.boolean(),
  ofs: z.boolean(),
  kinds: z.array(z.object({ id: z.string(), name: z.string() })),
  companies: z.array(z.string()),
  my_company: z.string().nullable(),
  today: z.string(),
});
export type FormContext = z.infer<typeof formContextSchema>;

// One literal, so supabase-js can type the rows from it.
export const IR_COLS =
  'id, project_id, number, ofs_number, version, requested_by, requester_name, requester_phone, requester_email, company, request_date, start_time, duration_kind, duration_min, kind, special_kind_id, items, attachment_ids, status, gc_at, gc_note, owner_id, helper_id, confirm_note, attendance, result, result_note, result_photo_ids, result_at, helper_report, helper_note, postpone_reason, postpone_note, postpone_until, postpone_count, ir_file_id, signed_at, pdf_stale, pdf_postponed, results_sent_at, summary, created_at, ofs_sent_at, ofs_sent_by, special_required, ofs_attest_at, ofs_ready_at, ofs_si_at, ir_special_kinds(name)';

export type IrRequest = Pick<
  Tables<'inspection_requests'>,
  | 'id'
  | 'project_id'
  | 'number'
  | 'ofs_number'
  | 'version'
  | 'requested_by'
  | 'requester_name'
  | 'requester_phone'
  | 'requester_email'
  | 'company'
  | 'request_date'
  | 'start_time'
  | 'duration_kind'
  | 'duration_min'
  | 'kind'
  | 'special_kind_id'
  | 'items'
  | 'attachment_ids'
  | 'status'
  | 'gc_at'
  | 'gc_note'
  | 'owner_id'
  | 'helper_id'
  | 'confirm_note'
  | 'attendance'
  | 'result'
  | 'result_note'
  | 'result_photo_ids'
  | 'result_at'
  | 'helper_report'
  | 'helper_note'
  | 'postpone_reason'
  | 'postpone_note'
  | 'postpone_until'
  | 'postpone_count'
  | 'ir_file_id'
  | 'signed_at'
  | 'pdf_stale'
  | 'pdf_postponed'
  | 'results_sent_at'
  | 'summary'
  | 'created_at'
  | 'ofs_sent_at'
  | 'ofs_sent_by'
  | 'special_required'
  | 'ofs_attest_at'
  | 'ofs_ready_at'
  | 'ofs_si_at'
> & { ir_special_kinds: { name: string } | null };

/** What every IR RPC returns: the whole row (no embedded kind name). */
export type IrRowRaw = Fns['ir_confirm']['Returns'];

export type IrEvent = Pick<Tables<'ir_events'>, 'id' | 'created_at' | 'actor_id' | 'action'>;

export type IrRecipient = Fns['ir_recipients']['Returns'][number];

export interface IrWhen {
  date: string;
  /** "HH:mm", or null for Flexible. */
  startTime: string | null;
  durationKind: DurationKind;
  durationMin: number | null;
}

export interface NewIrRequest extends IrWhen {
  projectId: string;
  company: string;
  kind: IrKind;
  specialKindId: string | null;
  items: string;
  attachmentIds: string[];
  noticeAck: boolean;
  /** An OFS request's one extra question: special inspection required? null on any other kind. */
  specialRequired: boolean | null;
  /** The inspector's one statement when he files an OFS request himself (it goes straight to OFS). */
  inspectorAck: boolean;
}

export interface NewBlock {
  projectId: string;
  orgId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  weekly: boolean;
  until: string | null;
}

export const irDownloadSchema = z.object({ url: z.string().url(), filename: z.string().min(1), mime: z.string() });

export const irSendResultSchema = z.object({
  delivery_status: z.string(),
  deliveries: z.array(z.object({ email: z.string(), status: z.string(), error: z.string().nullable() })),
  recipients: z.array(z.string()),
  mailto: z.string(),
});
export type IrSendResult = z.infer<typeof irSendResultSchema>;

/** ir-pdf answers with the updated row; only the id is pinned (the app refetches). */
export const irPdfResultSchema = z.object({ id: z.string() }).passthrough();
