// Safety shapes (migration 0060): a job's meetings, one meeting with its outline, the lines on its sheet, the topic
// library, when the next tailgate is due, and the public sign-in page's answers. Parsed with zod at the edge of the data
// layer, so a changed answer fails loudly.
import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kind = z.enum(['tailgate', 'meeting']);
const status = z.enum(['open', 'closed']);

/** One row of the job's meetings (safety_meetings_list). */
export const meetingRowSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  kind,
  held_on: day,
  title: z.string(),
  status,
  leader_id: z.string(),
  leader_name: z.string(),
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  signed: z.number().int(),
  version: z.number().int(),
});
export type MeetingRow = z.infer<typeof meetingRowSchema>;

/** One meeting as its screen shows it (safety_meeting). */
export const meetingSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  number: z.number().int(),
  kind,
  held_on: day,
  topic_id: z.string().nullable(),
  title: z.string(),
  notes: z.string(),
  points: z.array(z.string()),
  questions: z.array(z.string()),
  source: z.string().nullable(),
  source_url: z.string().nullable(),
  file_id: z.string().nullable(),
  /** The library topic carries a PDF (opened through its own gate). */
  topic_file: z.boolean(),
  leader_id: z.string(),
  leader_name: z.string(),
  location: z.string(),
  status,
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  closed_by: z.string().nullable(),
  closed_by_name: z.string().nullable(),
  /** When the sign-in link that works now was made (this device shows the QR while its copy matches). */
  token_made_at: z.string().nullable(),
  pdf_file_id: z.string().nullable(),
  version: z.number().int(),
  /** I lead it (its leader, or a safety manager): the QR, tick-in, Close. */
  can_lead: z.boolean(),
});
export type Meeting = z.infer<typeof meetingSchema>;

/** A signature as drawn: strokes of [x, y] points, fractions 0..1 of a pad twice as wide as tall. */
const signatureSchema = z.array(z.array(z.tuple([z.number(), z.number()])));
export type Signature = z.infer<typeof signatureSchema>;

export const SIGNIN_COLS = 'id, name, company, trade, via, person_id, signed_at, created_at';
/** With the strokes: a closed meeting's sheet (the live roster leaves them out; they are the heavy part). */
export const SIGNIN_COLS_FULL = `${SIGNIN_COLS}, signature`;

/** A line on the sheet. */
export const signinSchema = z.object({
  id: z.string(),
  name: z.string(),
  company: z.string(),
  trade: z.string(),
  via: z.enum(['link', 'member']),
  person_id: z.string().nullable(),
  signed_at: z.string().nullable(),
  created_at: z.string(),
  signature: signatureSchema.nullable().optional(),
});
export type Signin = z.infer<typeof signinSchema>;

export const TOPIC_COLS = 'id, org_id, slug, category, title, language, points, questions, source, source_url, file_id, version';

/** A library topic: a built-in starter (org_id null) or the company's own. */
export const topicSchema = z.object({
  id: z.string(),
  org_id: z.string().nullable(),
  slug: z.string().nullable(),
  category: z.string(),
  title: z.string(),
  language: z.string(),
  points: z.array(z.string()),
  questions: z.array(z.string()),
  source: z.string().nullable(),
  source_url: z.string().nullable(),
  file_id: z.string().nullable(),
  version: z.number().int(),
});
export type Topic = z.infer<typeof topicSchema>;

/** When the next tailgate is due on the job (safety_due). */
export const dueSchema = z.object({
  today: day,
  last_held_on: day.nullable(),
  due_on: day,
  open_count: z.number().int(),
});
export type SafetyDue = z.infer<typeof dueSchema>;

/** A sign-in link's token, handed out once (start, New QR, reopen). */
export const linkTokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), token_made_at: z.string() });
export type LinkToken = z.infer<typeof linkTokenSchema>;

export const startedSchema = linkTokenSchema.extend({ id: z.string(), number: z.number().int() });
export type Started = z.infer<typeof startedSchema>;

export const reopenedSchema = linkTokenSchema.extend({ version: z.number().int() });
export type Reopened = z.infer<typeof reopenedSchema>;

export const sheetFileSchema = z.object({ file_id: z.string() });

export interface StartInput {
  /** One per form: a repeat (a double tap, a retry) is the same meeting. */
  key: string;
  kind: 'tailgate' | 'meeting';
  topicId: string | null;
  title: string;
  notes: string;
  fileId: string | null;
  location: string;
}

export interface TopicInput {
  id: string | null;
  version: number | null;
  category: string;
  title: string;
  points: string[];
  questions: string[];
  source: string;
  sourceUrl: string;
  fileId: string | null;
}

/** The public sign-in page (SPEC §6.4 #8). */
export interface MeetingKey {
  meetingId: string;
  token: string;
}

export const publicMeetingSchema = z.object({
  project_name: z.string(),
  number: z.number().int(),
  kind,
  title: z.string(),
  held_on: day,
  /** Still takes signatures (open, and less than 18 hours since the start). */
  open: z.boolean(),
});
export type PublicMeeting = z.infer<typeof publicMeetingSchema>;

export const signedSchema = z.object({ status: z.literal('signed') });

export interface SignInput {
  name: string;
  company: string;
  trade: string;
  signature: Signature;
}
