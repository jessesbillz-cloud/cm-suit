// The meeting sign-in page's contract (SPEC §6.4 #8, migration 0060): what a call to the public meeting-signin function
// may carry and what an answer may contain. Pure (no I/O), so the whitelist is unit-tested (meetingSignin_test.ts). The
// SQL side (link_meeting_open / link_meeting_sign) already returns only these fields; the function passes everything
// through these projections as well, so a later change to the SQL can never widen what the public page sees.
import { uuid, z } from './validate.ts';

/** 32 random bytes as base64url: the shape safety_meeting_start / safety_meeting_qr hand out. */
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Malformed token');
const clean = (max: number) => z.string().trim().min(1).max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** What the database accepts (safety_signature_ok in 0060): strokes of points, fractions 0..1 of the pad. */
export const SIGNATURE_LIMITS = { strokes: 80, pointsPerStroke: 1500, points: 3000 } as const;

const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

/** A signature as drawn: 1 to 80 strokes, each 1 to 1500 points, 2 to 3000 points in all. */
export const signatureSchema = z
  .array(z.array(point).min(1).max(SIGNATURE_LIMITS.pointsPerStroke))
  .min(1)
  .max(SIGNATURE_LIMITS.strokes)
  .refine((s) => {
    const n = s.reduce((sum, stroke) => sum + stroke.length, 0);
    return n >= 2 && n <= SIGNATURE_LIMITS.points;
  }, 'Sign in the box.');
export type Signature = z.infer<typeof signatureSchema>;

/** The largest body a call may send: a full signature with its numbers rounded on the phone fits well inside. */
export const SIGNIN_MAX_BYTES = 96 * 1024;

export const MeetingSigninBody = z.discriminatedUnion('action', [
  /** The meeting as the page shows it: job, number, kind, title, day, and whether it still takes signatures. */
  z.object({ action: z.literal('open'), meeting_id: uuid, token }).strict(),
  /** One person signs: name, company, trade (optional) and the strokes. Never an id, a time or anyone else's name. */
  z.object({
    action: z.literal('sign'),
    meeting_id: uuid,
    token,
    name: clean(120),
    company: clean(120),
    trade: z.string().trim().max(80),
    signature: signatureSchema,
  }).strict(),
]);
export type MeetingSigninRequest = z.infer<typeof MeetingSigninBody>;

const Opened = z.object({
  project_name: z.string(),
  number: z.number().int(),
  kind: z.enum(['tailgate', 'meeting']),
  title: z.string(),
  held_on: day,
  open: z.boolean(),
});
const Signed = z.object({ status: z.literal('signed') });

// Type aliases (not interfaces) so they fit http.ts's Json record.
export type OpenAnswer = z.infer<typeof Opened>;
export type SignAnswer = z.infer<typeof Signed>;

/** The open answer: the page's facts only (zod object parsing drops every key not listed). */
export function openAnswer(raw: unknown): OpenAnswer {
  return Opened.parse(raw);
}

/** The sign answer: the status only, the same for a first signature and a repeat. */
export function signAnswer(raw: unknown): SignAnswer {
  return Signed.parse(raw);
}
