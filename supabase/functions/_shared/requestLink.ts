// The request link's contract (SPEC §6.4 #4, §13.2): what a call to the public request-link function may carry and
// what an answer may contain. Pure (no I/O), so the whitelist is unit-tested (requestLink_test.ts). The SQL side
// (link_request_* in migrations 0046 and 0055) already returns only these fields; the function passes everything through
// these projections as well, so a later change to the SQL can never widen what the public pages see.
import { uuid, z } from './validate.ts';

/** 32 random bytes as base64url: the shape rotate_request_link, rotate_request_hub and a receipt hand out. */
export const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Malformed token');
const clean = (max: number) => z.string().trim().min(1).max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-mm-dd');

/** A job's request page opens with the job's own token, or with a hub's token and the hub's id. */
export const job = { project_id: uuid, token, hub_id: uuid.optional() };

export const RequestLinkBody = z.discriminatedUnion('action', [
  /** The job's name, and whether this device's session is already on the job. */
  z.object({ action: z.literal('open'), ...job }).strict(),
  /** After the email code: records a requester invite for the signed-in address (never from the body). */
  z.object({ action: z.literal('join'), ...job, name: clean(120), company: clean(120) }).strict(),
  /** The hub's list of jobs. */
  z.object({ action: z.literal('hub'), hub_id: uuid, token }).strict(),
  /** The request day as an outsider sees it (no day = the job's today), and the form's choices. */
  z.object({ action: z.literal('calendar'), ...job, day: day.optional() }).strict(),
  /** A request sent through the link, by its private receipt alone. */
  z.object({ action: z.literal('status'), project_id: uuid, receipt: token }).strict(),
]);
export type RequestLinkRequest = z.infer<typeof RequestLinkBody>;

const PHONE = /^\+?[0-9 ().-]{7,30}$/;

/** Who is asking and when, and the notice: the fields every request from the link carries (also the revs request). */
export const visitorFields = {
  name: clean(120),
  company: clean(120),
  phone: z.string().trim().max(30).refine((v) => v === '' || (PHONE.test(v) && v.replace(/\D/g, '').length >= 7), 'Check the phone number.'),
  email: z.string().trim().toLowerCase().max(320).refine((v) => v === '' || z.string().email().safeParse(v).success, 'Check the email.'),
  date: day,
  /** Job-clock time on the half hour, 24-hour; null = Flexible. */
  time: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/, 'Pick a time on the half hour.').nullable(),
  duration_kind: z.enum(['timed', 'all_day', 'periodic']),
  duration_min: z.number().int().min(5).max(720).nullable(),
  notice_ack: z.literal(true),
};

/** A phone or an email (at least one). */
export const hasContact = (b: { phone: string; email: string }): boolean => b.phone !== '' || b.email !== '';
/** A length in minutes exactly when timed. */
export const lengthFits = (b: { duration_kind: string; duration_min: number | null }): boolean =>
  (b.duration_kind === 'timed') === (b.duration_min !== null);
export const CONTACT_RULE = { message: 'Add a phone or an email.', path: ['phone'] };
export const LENGTH_RULE = { message: 'Pick how long it takes.', path: ['duration_min'] };

/**
 * A request sent with no login: the multipart form's `payload` field (the files ride in `file` fields). Every field
 * the member form has, plus the visitor's contact; never an uploader, a path, a number or a status.
 */
export const SubmitBody = z
  .object({
    action: z.literal('submit'),
    ...job,
    ...visitorFields,
    kind: z.enum(['ior', 'special', 'ofs']),
    special_kind_id: uuid.nullable(),
    items: clean(4000),
  })
  .strict()
  .refine(hasContact, CONTACT_RULE)
  .refine(lengthFits, LENGTH_RULE)
  .refine((b) => (b.kind === 'special') === (b.special_kind_id !== null), { message: 'Pick the special inspection.', path: ['special_kind_id'] });
export type SubmitRequest = z.infer<typeof SubmitBody>;

const Opened = z.object({ project_name: z.string() });
const Joined = z.object({ project_name: z.string(), status: z.enum(['added', 'member']) });
const Hub = z.object({ jobs: z.array(z.object({ project_id: uuid, name: z.string() })) });

/** One line of an outsider's day: time, length, type and color. Never a company, items, number or name. */
const DayRow = z.object({
  start_time: z.string().nullable(),
  duration_kind: z.string(),
  duration_min: z.number().int().nullable(),
  kind: z.string(),
  status_key: z.string(),
});
const Calendar = z.object({
  today: day,
  day,
  ofs: z.boolean(),
  kinds: z.array(z.object({ id: uuid, name: z.string() })),
  rows: z.array(DayRow),
});

/** The visitor's own request as the status link shows it: the tracker's facts and the inspector's result line. */
const Facts = z.object({
  project_name: z.string(),
  number: z.number().int(),
  request_date: day,
  start_time: z.string().nullable(),
  duration_kind: z.string(),
  duration_min: z.number().int().nullable(),
  kind: z.string(),
  special_kind: z.string().nullable(),
  status: z.string(),
  result: z.string().nullable(),
  result_note: z.string().nullable(),
  gc_step: z.boolean(),
});
/** ...and, once, the private receipt token for the status link. */
const Submitted = Facts.extend({ receipt: token });

/** The files link_request_files registered: where the function stores each one's bytes. */
const Registered = z.object({ files: z.array(z.object({ id: uuid, storage_path: z.string().min(1) })).min(1).max(3) });

// A type alias (not an interface) so it fits http.ts's Json record.
export type OpenAnswer = {
  project_name: string;
  /** The caller's own session is an active member of the job (they go straight in). */
  member: boolean;
  /** ...and may request inspections there (they land in the request form). */
  can_request: boolean;
};
export type JoinAnswer = z.infer<typeof Joined>;
export type HubAnswer = z.infer<typeof Hub>;
export type CalendarAnswer = z.infer<typeof Calendar>;
export type StatusAnswer = z.infer<typeof Facts>;
export type SubmitAnswer = z.infer<typeof Submitted>;
export type RegisteredFiles = z.infer<typeof Registered>;

/** The job name only (zod object parsing drops every key not listed). */
export function openedJob(raw: unknown): { project_name: string } {
  return Opened.parse(raw);
}

/** The open answer: the job's name plus two facts about the caller's own session. */
export function openAnswer(raw: unknown, member: boolean, canRequest: boolean): OpenAnswer {
  return { project_name: openedJob(raw).project_name, member, can_request: member && canRequest };
}

export function joinAnswer(raw: unknown): JoinAnswer {
  return Joined.parse(raw);
}

/** Job names and ids only: nothing about the hub's owner. */
export function hubAnswer(raw: unknown): HubAnswer {
  return Hub.parse(raw);
}

/** The outsider's day and the form's choices. */
export function calendarAnswer(raw: unknown): CalendarAnswer {
  return Calendar.parse(raw);
}

/** The status link's answer. */
export function statusAnswer(raw: unknown): StatusAnswer {
  return Facts.parse(raw);
}

/** The submit answer: the status facts plus the receipt token. */
export function submitAnswer(raw: unknown): SubmitAnswer {
  return Submitted.parse(raw);
}

/** link_request_files' answer, one slot per file sent, in order. */
export function registeredFiles(raw: unknown, count: number): RegisteredFiles['files'] {
  const files = Registered.parse(raw).files;
  if (files.length !== count) throw new Error(`registered ${files.length} files for ${count}`);
  return files;
}
