// Inspection requests with no login (SPEC §6.4 #4, migration 0055): the public request-link function's answers, checked
// with zod so a changed contract fails here, and what the visitor's form sends.
import { z } from 'zod';
import type { CalendarRow, DurationKind, IrKind } from './inspections.types';

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
});
export type RequestFacts = z.infer<typeof requestFactsSchema>;

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
  /** Picked photos (compressed on send) and PDFs, 3 at most. */
  files: File[];
}
