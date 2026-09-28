// RFIs on the server (SPEC §14.1, §6.9): the row and the detail the rfis function reads as the caller, the signed
// content and its hash, the PDF's plan (everything it shows) and its key, the labels and the filename. Pure except
// loadRfi / loadRfiDetail.
import { type Db, must, rpc } from './db.ts';
import { contentHash } from './crypto.ts';
import { HttpError } from './http.ts';
import { z } from './validate.ts';
import { buildFilename } from './buildFilename.ts';
import { signedAtLabel } from './inspections.ts';
import type { RfiPdfText } from './pdf/rfi.ts';

const nullableString = z.string().nullable();

const rfiRowSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string(),
  created_by: z.string(),
  version: z.number().int(),
  number: z.number().int().nullable(),
  status: z.enum(['draft', 'review', 'issue', 'open', 'answered', 'closed', 'void']),
  title: z.string(),
  question: z.string(),
  suggestion: z.string(),
  refs: z.string(),
  photo_ids: z.array(z.string()),
  cost_impact: z.boolean().nullable(),
  time_impact: z.boolean().nullable(),
  needed_by: nullableString,
  due_at: nullableString,
  sent_at: nullableString,
  sent_by: nullableString,
  sent_hash: nullableString,
  issued_at: nullableString,
  issued_by: nullableString,
  issued_hash: nullableString,
  answer: nullableString,
  answer_file_ids: z.array(z.string()),
  answered_at: nullableString,
  answered_by: nullableString,
  impact_until: nullableString,
  impact_claimed_at: nullableString,
  impact_cost: z.boolean().nullable(),
  impact_time: z.boolean().nullable(),
  impact_note: nullableString,
  impact_gc_note: nullableString,
  void_note: nullableString,
  pdf_file_id: nullableString,
  pdf_hash: nullableString,
});
export type RfiRow = z.infer<typeof rfiRowSchema>;

export function parseRfi(value: unknown): RfiRow {
  return rfiRowSchema.parse(value);
}

/** The RFI AS THE CALLER (RLS): someone who may not see it gets 404. */
export async function loadRfi(client: Db, rfiId: string): Promise<RfiRow> {
  const row: unknown = must(
    await client.from('rfis').select('*').eq('id', rfiId).is('deleted_at', null).maybeSingle(),
    'rfi lookup',
  );
  if (row === null) throw new HttpError(404, 'RFI not found');
  return parseRfi(row);
}

const fileRef = z.object({ id: z.string(), original_name: z.string(), mime: z.string() });
export type RfiFileRef = z.infer<typeof fileRef>;

const detailSchema = z.object({
  rfi: z.record(z.unknown()),
  originator_name: z.string(),
  originator_company: z.string(),
  issuer_name: nullableString,
  answerer_name: nullableString,
  photos: z.array(fileRef),
  answer_files: z.array(fileRef),
  settings: z.object({ answer_days: z.number().int(), impact_days: z.number().int() }),
});

export interface RfiDetail extends Omit<z.infer<typeof detailSchema>, 'rfi'> {
  rfi: RfiRow;
  /** The row exactly as the database returned it (every column), for responses. */
  raw: Record<string, unknown>;
}

/** rfi_detail as the caller (it records a holder's first open, like opening it in the app). */
export async function loadRfiDetail(client: Db, rfiId: string): Promise<RfiDetail> {
  const d = detailSchema.parse(await rpc<unknown>(client, 'rfi_detail', { p_rfi_id: rfiId }));
  return { ...d, rfi: parseRfi(d.rfi), raw: d.rfi };
}

/**
 * What the two signatures bind (SPEC §6.9): the text and attachments the originator wrote and the reviewers may edit.
 * Status, number, dates and the answer are not part of it.
 */
export function rfiContent(r: RfiRow): Record<string, unknown> {
  return {
    title: r.title,
    question: r.question,
    suggestion: r.suggestion,
    refs: r.refs,
    needed_by: r.needed_by,
    cost_impact: r.cost_impact,
    time_impact: r.time_impact,
    photo_ids: r.photo_ids,
  };
}

export function rfiHash(r: RfiRow): Promise<string> {
  return contentHash(rfiContent(r));
}

/** "RFI 003 Slab edge.pdf", or "RFI Draft Slab edge.pdf" before it has a number. Safe characters, title cut at 120. */
export function rfiFilename(number: number | null, title: string): string {
  const clean = [...title].map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('')
    .trim().slice(0, 120).trim();
  const fields = { Title: clean };
  return number === null
    ? buildFilename('RFI Draft {Title}.pdf', { fields })
    : buildFilename('RFI {###} {Title}.pdf', { number, fields });
}

/** An instant as a day in the job's zone, e.g. "Oct 1, 2026". */
export function dateInZone(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${iso}`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(d);
}

/** A calendar day as written ("2026-10-01" -> "Oct 1, 2026"): no instant, so no zone shift. */
export function calendarDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a day: ${day}`);
  return dateInZone(`${day}T12:00:00Z`, 'UTC');
}

/** The impact window the RFI actually got (fixed when it was answered), else the job's setting. */
export function impactDaysOf(r: Pick<RfiRow, 'answered_at' | 'impact_until'>, settingDays: number): number {
  if (r.answered_at === null || r.impact_until === null) return settingDays;
  return Math.round((Date.parse(r.impact_until) - Date.parse(r.answered_at)) / 86_400_000);
}

export interface RfiJob {
  name: string;
  number: string | null;
  address: string | null;
  timezone: string;
  /** The job's company (the GC): its name and logo head the PDF. */
  orgName: string;
  logoPath: string | null;
}

export interface RfiStamp {
  signerId: string;
  name: string;
  signedAtLabel: string;
  align: 'left' | 'right';
}

/** Everything the PDF shows, before any bytes are fetched. Its key decides whether a stored PDF is still current. */
export interface RfiPdfPlan {
  text: RfiPdfText;
  /** Photos the PDF embeds (JPEG / PNG); others are listed by name in `text`. */
  photos: RfiFileRef[];
  logoPath: string | null;
  /** The originator's signature bottom left, the PM / PE's bottom right. */
  stamps: RfiStamp[];
  filename: string;
}

const EMBEDDABLE = /^image\/(jpeg|png)$/i;

export function rfiPdfPlan(d: Omit<RfiDetail, 'raw'>, job: RfiJob): RfiPdfPlan {
  const r = d.rfi;
  const tz = job.timezone;
  const photos = d.photos.filter((p) => EMBEDDABLE.test(p.mime));
  const text: RfiPdfText = {
    orgName: job.orgName,
    job: { name: job.name, number: job.number, address: job.address },
    number: r.number,
    mark: r.status === 'void' ? 'VOID' : r.number === null ? 'DRAFT' : null,
    title: r.title,
    question: r.question,
    suggestion: r.suggestion,
    refs: r.refs,
    from: { name: d.originator_name, company: d.originator_company },
    to: d.answerer_name ?? 'Architect',
    sentLabel: r.sent_at === null ? null : dateInZone(r.sent_at, tz),
    issuedLabel: r.issued_at === null ? null : dateInZone(r.issued_at, tz),
    dueLabel: r.due_at === null ? null : dateInZone(r.due_at, tz),
    neededByLabel: r.needed_by === null ? null : calendarDay(r.needed_by),
    costImpact: r.cost_impact,
    timeImpact: r.time_impact,
    otherPhotos: d.photos.filter((p) => !EMBEDDABLE.test(p.mime)).map((p) => p.original_name),
    answer: r.answer !== null && r.answered_at !== null
      ? {
        text: r.answer,
        by: d.answerer_name ?? 'Architect',
        dateLabel: dateInZone(r.answered_at, tz),
        files: d.answer_files.map((f) => f.original_name),
      }
      : null,
    impactDays: impactDaysOf(r, d.settings.impact_days),
    claim: r.impact_claimed_at === null
      ? null
      : {
        cost: r.impact_cost === true,
        time: r.impact_time === true,
        dateLabel: dateInZone(r.impact_claimed_at, tz),
        note: r.impact_note,
        gcNote: r.impact_gc_note,
      },
  };
  const stamps: RfiStamp[] = [];
  if (r.sent_at !== null && r.sent_by !== null) {
    stamps.push({ signerId: r.sent_by, name: d.originator_name, signedAtLabel: signedAtLabel(r.sent_at, tz), align: 'left' });
  }
  if (r.issued_at !== null && r.issued_by !== null) {
    stamps.push({
      signerId: r.issued_by, name: d.issuer_name ?? 'PM / PE', signedAtLabel: signedAtLabel(r.issued_at, tz), align: 'right',
    });
  }
  return { text, photos, logoPath: job.logoPath, stamps, filename: rfiFilename(r.number, r.title) };
}

/** The stored PDF's key (rfis.pdf_hash): a change to anything it shows makes a new one. */
export function rfiPdfKey(plan: RfiPdfPlan): Promise<string> {
  return contentHash({
    v: 1,
    text: plan.text,
    photos: plan.photos.map((p) => p.id),
    logo: plan.logoPath,
    stamps: plan.stamps,
    filename: plan.filename,
  });
}
