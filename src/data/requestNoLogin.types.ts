// Inspection requests with no login (SPEC §6.4 #4, migrations 0055 and 0057): the public request-link function's answers,
// checked with zod so a changed contract fails here, and what the visitor's form sends. 0057: the job's walls for the revs
// request (status only), the revs request itself, and the request's map by its receipt.
import { z } from 'zod';
import type { CalendarRow, DurationKind, IrKind } from './inspections.types';
import { irStrokesSchema, type RevSetup, type RevStatusRow } from './revs.types';

/** One line of the job's day as an outsider sees it: time, length, type and color. */
const dayRowSchema = z.object({
  start_time: z.string().nullable(),
  duration_kind: z.string(),
  duration_min: z.number().nullable(),
  kind: z.string(),
  status_key: z.string(),
});

export const publicDaySchema = z.object({
  /** The job's today (its own zone). */
  today: z.string(),
  day: z.string(),
  ofs: z.boolean(),
  kinds: z.array(z.object({ id: z.string(), name: z.string() })),
  rows: z.array(dayRowSchema),
});

export type PublicDayAnswer = z.infer<typeof publicDaySchema>;

/** The day, its rows shaped like the app's calendar rows (anonymized), so the day list is one component. */
export interface PublicDay {
  today: string;
  day: string;
  ofs: boolean;
  kinds: { id: string; name: string }[];
  rows: CalendarRow[];
}

/** The visitor's own request: the tracker's facts and the inspector's result line. */
export const requestFactsSchema = z.object({
  project_name: z.string(),
  number: z.number(),
  request_date: z.string(),
  start_time: z.string().nullable(),
  duration_kind: z.string(),
  duration_min: z.number().nullable(),
  kind: z.string(),
  special_kind: z.string().nullable(),
  status: z.string(),
  result: z.string().nullable(),
  result_note: z.string().nullable(),
  /** The job has the GC step on, or this request went through it. */
  gc_step: z.boolean(),
  /** An OFS request the inspector has sent to OFS (0061): the tracker's OFS step. */
  ofs_sent: z.boolean(),
  /** 0075: while postponed, why, the inspector's note to the requester and the expected day; null otherwise. */
  postpone_reason: z.string().nullable(),
  postpone_note: z.string().nullable(),
  postpone_until: z.string().nullable(),
  /** The inspector's attendance call (be_present / alone), or null. */
  attendance: z.string().nullable(),
  /** The IR PDF is made: View IR through the receipt. */
  has_ir: z.boolean(),
});
export type RequestFacts = z.infer<typeof requestFactsSchema>;

/** The request's IR PDF by its receipt (0075): a short-lived URL (downloads with this filename). */
export const publicIrSchema = z.object({ url: z.string().url(), filename: z.string().min(1) });
export type PublicIr = z.infer<typeof publicIrSchema>;

/** ...plus, once, the private token of its status link. */
export const submittedSchema = requestFactsSchema.extend({ receipt: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export type Submitted = z.infer<typeof submittedSchema>;

/** Who is asking: remembered on the device. A phone or an email (at least one). */
export interface Contact {
  name: string;
  company: string;
  phone: string;
  email: string;
}

export interface PublicRequestInput {
  contact: Contact;
  date: string;
  /** "HH:mm", or null for Flexible. */
  startTime: string | null;
  durationKind: DurationKind;
  durationMin: number | null;
  kind: IrKind;
  specialKindId: string | null;
  items: string;
  /** An OFS request's one extra question (0061): special inspection required? null on any other kind. */
  specialRequired: boolean | null;
  /** Picked photos (compressed on send) and PDFs, 3 at most. */
  files: File[];
}

/** The job's walls for the revs request from the link: lists, revs, items, walls, and each cell's status only (a failed
 *  cell is open to the link; never a number, a note or a name). */
export const publicRevsSchema = z.object({
  lists: z.array(z.object({ id: z.string(), name: z.string(), phase: z.string().nullable(), position: z.number() })),
  revs: z.array(z.object({ id: z.string(), list_id: z.string(), number: z.number(), name: z.string() })),
  items: z.array(z.object({ id: z.string(), rev_id: z.string(), name: z.string(), company: z.string().nullable(), position: z.number() })),
  areas: z.array(
    z.object({ id: z.string(), list_id: z.string(), level: z.string(), name: z.string(), sheet_file_id: z.string().nullable(), position: z.number() }),
  ),
  status: z.array(z.object({ area_id: z.string(), item_id: z.string(), status: z.enum(['open', 'requested', 'passed', 'na']) })),
});
export type PublicRevsAnswer = z.infer<typeof publicRevsSchema>;

/** The link's walls in the member screens' shapes, so the revs picker takes either: the setup (N/A marks from the
 *  status) and a status row per wall x item with nothing but its status. */
export interface PublicRevs {
  setup: RevSetup;
  status: RevStatusRow[];
}

/** The link's answer in the member screens' shapes: read-only rows (version 0), N/A marks from the status. */
export function asPublicRevs(projectId: string, raw: PublicRevsAnswer): PublicRevs {
  const row = { project_id: projectId, version: 0, deleted_at: null };
  const status: RevStatusRow[] = raw.status.map((s) => ({
    area_id: s.area_id, item_id: s.item_id, status: s.status, request_id: null, ir_number: null, ofs_number: null, at: null, note: null,
  }));
  return {
    setup: {
      lists: raw.lists.map((l) => ({ ...row, ...l, permit_id: null })),
      revs: raw.revs.map((r) => ({ ...row, ...r })),
      items: raw.items.map((i) => ({ ...row, ...i })),
      // The link's walls carry no line on the plan (0059: the visitor's picker doesn't use the plan yet).
      areas: raw.areas.map((a) => ({ ...row, ...a, sheet_page: 1, geom: null })),
      marks: raw.status
        .filter((s) => s.status === 'na')
        .map((s) => ({ ...row, id: `na:${s.area_id}:${s.item_id}`, area_id: s.area_id, item_id: s.item_id, kind: 'na' })),
    },
    status,
  };
}

const mapColorSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** The visitor's own map (by the receipt): title parts, legend, sheet, strokes, and what they may do now. */
const publicMapSchema = z.object({
  number: z.number(),
  ofs_number: z.number().nullable(),
  phase: z.string().nullable(),
  request_date: z.string(),
  what: z.string(),
  sheet_file_id: z.string().nullable(),
  page: z.number(),
  strokes: irStrokesSchema,
  legend: z.array(z.object({ color: mapColorSchema, name: z.string() })),
  result: z.string().nullable(),
  signed: z.boolean(),
  version: z.number(),
  /** A map PDF is made. */
  has_map: z.boolean(),
  /** The request or the drawing changed since that PDF. */
  stale: z.boolean(),
  /** May the visitor draw now: until the inspector records a result. */
  can_edit: z.boolean(),
  /** The request's walls' sheets the map may switch to, by level. */
  sheets: z.array(z.object({ file_id: z.string(), label: z.string() })),
});
export type PublicMap = z.infer<typeof publicMapSchema>;

/** null: the request has no walls (not a revs request), so no map. */
export const publicMapAnswerSchema = z.object({ map: publicMapSchema.nullable() });

export const publicSheetSchema = z.object({ url: z.string().url() });
export const publicMapFileSchema = z.object({ url: z.string().url(), filename: z.string().min(1) });

/** The revs request from the link: who and when (as the plain request), the walls and 1 to 3 items, the sheet (null = the
 *  first wall's), and up to 3 photos or PDFs. The database composes what to inspect. */
export interface PublicOfsInput {
  contact: Contact;
  date: string;
  /** "HH:mm", or null for Flexible. */
  startTime: string | null;
  durationKind: DurationKind;
  durationMin: number | null;
  areaIds: string[];
  itemIds: string[];
  sheetFileId: string | null;
  /** Special inspection required? (0061; every OFS request answers it.) */
  specialRequired: boolean;
  files: File[];
}
