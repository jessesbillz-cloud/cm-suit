// The sign-in sheet on file (Safety, migration 0060): ONE way to make it. The facts come from safety_meeting_sheet,
// run as the caller (safety.read, a closed meeting); their content hash decides: the sheet on file already shows
// exactly that, so it is the answer; else buildSafetySheet (pdf/safetySheet.ts) -> storeGeneratedPdf into the job's
// Safety folder (`replaces` the previous sheet: its next version) -> safety_meeting_attach (service role only). The
// service client is the caller's (an allowlisted function); this module never makes one.
import { type Db, rpc } from './db.ts';
import { z } from './validate.ts';
import { contentHash } from './crypto.ts';
import { buildFilename } from './buildFilename.ts';
import { storeGeneratedPdf } from './generatedPdf.ts';
import { dayLabel, signedAtLabel } from './inspections.ts';
import { buildSafetySheet, type SafetySheetInput } from './pdf/safetySheet.ts';
import { signatureSchema } from './meetingSignin.ts';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const attendeeSchema = z.object({
  name: z.string(),
  company: z.string(),
  trade: z.string(),
  via: z.enum(['link', 'member']),
  signed_at: z.string().nullable(),
  signature: signatureSchema.nullable(),
  added_by_name: z.string().nullable(),
});

/** What safety_meeting_sheet answers. */
export const sheetFactsSchema = z.object({
  meeting_id: z.string(),
  project_id: z.string(),
  job_name: z.string(),
  job_number: z.string().nullable(),
  timezone: z.string(),
  number: z.number().int(),
  kind: z.enum(['tailgate', 'meeting']),
  held_on: day,
  title: z.string(),
  notes: z.string(),
  points: z.array(z.string()),
  questions: z.array(z.string()),
  source: z.string().nullable(),
  source_url: z.string().nullable(),
  leader_name: z.string(),
  location: z.string(),
  opened_at: z.string(),
  closed_at: z.string(),
  closed_by_name: z.string(),
  pdf_file_id: z.string().nullable(),
  content_hash: z.string().nullable(),
  attendees: z.array(attendeeSchema).max(300),
});
export type SheetFacts = z.infer<typeof sheetFactsSchema>;

/** "Tailgate" / "Meeting" (the database's safety_kind_label). */
export function kindLabel(kind: SheetFacts['kind']): string {
  return kind === 'tailgate' ? 'Tailgate' : 'Meeting';
}

/** "7:42 AM" in the job's zone. */
export function clockLabel(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${iso}`);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(d);
}

/** Everything the sheet shows: its content hash says whether the sheet on file is still this paper. */
export function sheetContent(f: SheetFacts): Record<string, unknown> {
  const { pdf_file_id: _file, content_hash: _hash, ...shown } = f;
  return { kind_of: 'safety_sheet', ...shown };
}

/** The builder's input from the facts: labels in the job's zone, signatures as drawn. */
export function sheetInput(f: SheetFacts): SafetySheetInput {
  return {
    job: { name: f.job_name, number: f.job_number },
    kindLabel: kindLabel(f.kind),
    number: f.number,
    dayLabel: dayLabel(f.held_on),
    title: f.title,
    leader: f.leader_name,
    location: f.location,
    points: f.points,
    questions: f.questions,
    notes: f.notes,
    source: f.source,
    sourceUrl: f.source_url,
    closedLabel: `${signedAtLabel(f.closed_at, f.timezone)} by ${f.closed_by_name}`,
    attendees: f.attendees.map((a) => ({
      name: a.name,
      company: a.company,
      trade: a.trade,
      timeLabel: a.signed_at ? clockLabel(a.signed_at, f.timezone) : null,
      signature: a.signature,
      tickedBy: a.signature ? null : a.added_by_name,
    })),
  };
}

/** The current sheet's file id: the one on file when it already shows exactly this, else a new version made now. */
export async function ensureSheet(service: Db, facts: SheetFacts, createdBy: string): Promise<string> {
  const hash = await contentHash(sheetContent(facts));
  if (facts.pdf_file_id && facts.content_hash === hash) return facts.pdf_file_id;
  const bytes = await buildSafetySheet(sheetInput(facts));
  const folderId = await rpc<string>(service, 'safety_folder_make', { p_project_id: facts.project_id });
  const name = buildFilename('{Kind} {###} {Project} {MM-DD-YYYY}.pdf', {
    number: facts.number,
    date: facts.held_on,
    fields: { Kind: kindLabel(facts.kind), Project: facts.job_name },
  });
  const stored = await storeGeneratedPdf(service, {
    projectId: facts.project_id, folderId, name, bytes, createdBy, replaces: facts.pdf_file_id,
  });
  await rpc(service, 'safety_meeting_attach', { p_meeting_id: facts.meeting_id, p_file_id: stored.id, p_content_hash: hash });
  return stored.id;
}
