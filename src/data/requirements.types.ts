// Requirements shapes (migrations 0069, 0073): the job's register as requirements_list answers it (drafts only for
// managers, days left on the job's clock, the line's company and whether it is my company's), the companies on the job,
// the spec book's sections, a save, and what a read of a section with AI added. Parsed with zod at the edge of the data
// layer, so a changed answer fails loudly.
import { z } from 'zod';
import { KIND_VALUES, REQUIRED_VALUES, STATUS_VALUES, type RequiredOption, type RequirementKind } from '../lib/requirements';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One line of the register (requirements_list). */
export const requirementSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  kind: z.enum(KIND_VALUES),
  title: z.string(),
  details: z.string(),
  spec_section: z.string(),
  spec_title: z.string(),
  spec_ref: z.string(),
  responsible: z.string(),
  required: z.enum(REQUIRED_VALUES),
  notice_days: z.number().int().nullable(),
  lead_days: z.number().int().nullable(),
  activity_code: z.string(),
  activity_name: z.string(),
  trigger_date: day.nullable(),
  /** Set by the database: the trigger date less the notice and lead days. */
  due_on: day.nullable(),
  /** Days from today on the job's clock to the due date (negative: late). */
  days_left: z.number().int().nullable(),
  status: z.enum(STATUS_VALUES),
  status_at: z.string().nullable(),
  evidence_note: z.string(),
  evidence_file_id: z.string().nullable(),
  /** Null when the file is gone or not mine to see. */
  evidence_file_name: z.string().nullable(),
  origin: z.enum(['hand', 'ai']),
  draft: z.boolean(),
  source_file_id: z.string().nullable(),
  source_file_name: z.string().nullable(),
  source_page: z.number().int().nullable(),
  source_quote: z.string(),
  created_at: z.string(),
  /** The company on the job the line belongs to (a manager picks it); null: only the words say who. */
  company_org_id: z.string().nullable(),
  /** My own company's line (requirements.read_own): I may add its evidence. */
  mine: z.boolean(),
});
export type Requirement = z.infer<typeof requirementSchema>;

/** A company on the job (requirement_companies): what a manager picks a line's company from. */
export const requirementCompanySchema = z.object({ org_id: z.string(), name: z.string() });
export type RequirementCompany = z.infer<typeof requirementCompanySchema>;

/** A section of a spec book in the job's Specs folder (requirements_spec_sections); section null: none found yet. */
export const specSectionSchema = z.object({
  file_id: z.string(),
  file_name: z.string(),
  page_count: z.number().int().nullable(),
  text_ready: z.boolean(),
  section: z.string().nullable(),
  title: z.string().nullable(),
  first_page: z.number().int().nullable(),
  last_page: z.number().int().nullable(),
});
export type SpecSection = z.infer<typeof specSectionSchema>;

export const savedSchema = z.object({ id: z.string(), version: z.number().int() });
export type Saved = z.infer<typeof savedSchema>;

export const statusSetSchema = z.object({ id: z.string(), version: z.number().int(), status: z.enum(STATUS_VALUES) });

/** What a read of one section added (requirements-extract). */
export const extractedSchema = z.object({
  found: z.number().int(),
  added: z.number().int(),
  /** The job has them already (kept, drafts, or dropped before). */
  skipped: z.number().int(),
  /** Left out: the quoted sentence is not in the text. */
  unquoted: z.number().int(),
  model: z.string(),
});
export type Extracted = z.infer<typeof extractedSchema>;

/** Add (id null, with a key so a repeat is the same line) or change (with the version). */
export interface RequirementInput {
  id: string | null;
  version: number | null;
  key: string;
  kind: RequirementKind;
  title: string;
  details: string;
  specSection: string;
  specTitle: string;
  specRef: string;
  responsible: string;
  /** The company on the job it belongs to; null: none (the words say who). Its name becomes the words. */
  companyOrgId: string | null;
  required: RequiredOption;
  noticeDays: number | null;
  leadDays: number | null;
  activityCode: string;
  activityName: string;
  triggerDate: string | null;
}

/** One spec section's pages of a file in the Specs folder, or its text pasted. */
export type ExtractInput =
  | { source: 'file'; fileId: string; firstPage: number; lastPage: number }
  | { source: 'text'; text: string };
