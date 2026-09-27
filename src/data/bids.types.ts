// Bid shapes the app reads (SPEC §11). Table rows derive from the generated types; the bidder page JSON and the
// edge-function answers are parsed with zod at the boundary so a changed contract fails loudly here.
import { z } from 'zod';
import type { Database, Tables } from './database.types';

type Fns = Database['public']['Functions'];

export type CoverageRow = Fns['bid_coverage']['Returns'][number];

export type PackageRow = Pick<Tables<'bid_packages'>, 'id' | 'project_id' | 'code' | 'name' | 'scope_text' | 'version'>;

export type InviteRow = Pick<Tables<'bid_invites'>, 'id' | 'package_id' | 'member_id' | 'status' | 'decline_reason'>;

export type QuestionRow = Pick<
  Tables<'bid_questions'>,
  'id' | 'project_id' | 'package_id' | 'number' | 'question' | 'status' | 'created_at' | 'version'
>;

export type AddendumRow = Pick<Tables<'addenda'>, 'id' | 'project_id' | 'number' | 'title' | 'body' | 'file_ids' | 'issued_at' | 'version'>;

export type AckRow = Pick<Tables<'addendum_acks'>, 'addendum_id' | 'member_id'>;

export type SubmissionRow = Pick<
  Tables<'bid_submissions'>,
  'id' | 'package_id' | 'member_id' | 'sub_id' | 'file_id' | 'receipt_number' | 'received_at' | 'is_late' | 'version_no'
>;

/** The list view's slice of every extraction on a job: enough for the bidder name and the read chip. */
export type ExtractionSummary = Pick<Tables<'bid_extractions'>, 'id' | 'submission_id' | 'status' | 'bidder_name'>;

/** A directory sub as the intake needs it: the company name to match a read bid against. */
export type SubName = Pick<Tables<'subs'>, 'id' | 'company'>;

/** A file in "Bids received": the row's name, the intake's duplicate check (name + size) and the read chip. */
export type ReceivedFile = Pick<Tables<'files'>, 'id' | 'original_name' | 'size' | 'text_status' | 'upload_complete'>;

/** What extract-bid answers; only the parts the app acts on (linking the sub) are pinned. */
export const readBidResultSchema = z
  .object({ extraction_id: z.string(), findings: z.object({ bidder_name: z.string().nullable() }).passthrough() })
  .passthrough();
export type ReadBidResult = z.infer<typeof readBidResultSchema>;

export type ExtractionRow = Pick<
  Tables<'bid_extractions'>,
  | 'id'
  | 'submission_id'
  | 'status'
  | 'bidder_name'
  | 'bid_date'
  | 'document_kind'
  | 'prevailing_wage'
  | 'prevailing_wage_evidence'
  | 'validity_days'
  | 'scope_summary'
  | 'inclusions'
  | 'exclusions'
  | 'notable_terms'
  | 'project_match'
  | 'confidence'
  | 'version'
>;

const alternateSchema = z.object({
  label: z.string().catch(''),
  amount: z.number().nullable().catch(null),
  evidence: z.string().nullable().catch(null),
  page: z.number().nullable().catch(null),
});
/** Alternates live in jsonb; anything malformed is dropped rather than breaking the view. */
export const alternatesSchema = z.array(alternateSchema).catch([]);

export interface PricingView {
  base_amount: number | null;
  base_evidence: string | null;
  base_page: number | null;
  alternates: z.infer<typeof alternatesSchema>;
}

/** yes = pricing visible; two_factor = the role has it but this session is aal1; no = not a pricing role. */
export type PricingAccess = 'yes' | 'two_factor' | 'no';

// ---------------------------------------------------------------------------
// bidder_page(p_project_id) JSON
// ---------------------------------------------------------------------------
const submissionSchema = z.object({
  id: z.string(),
  receipt_number: z.number(),
  received_at: z.string(),
  is_late: z.boolean(),
  version_no: z.number(),
  file_id: z.string(),
  superseded: z.boolean(),
});

const bidderPackageSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  scope_text: z.string(),
  invite: z.object({ id: z.string(), status: z.string() }).nullable(),
  submissions: z.array(submissionSchema),
});

export const bidderPageSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    number: z.string().nullable(),
    address: z.string().nullable(),
    timezone: z.string(),
    bid_due_at: z.string().nullable(),
    prevailing_wage: z.boolean(),
  }),
  upload_folder_id: z.string().nullable(),
  packages: z.array(bidderPackageSchema),
  addenda: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      title: z.string(),
      body: z.string(),
      file_ids: z.array(z.string()),
      issued_at: z.string(),
      acked_at: z.string().nullable(),
    }),
  ),
  answers: z.array(z.object({ number: z.number(), question_text: z.string(), answer: z.string(), published_at: z.string() })),
  my_questions: z.array(
    z.object({ id: z.string(), number: z.number(), question: z.string(), status: z.string(), created_at: z.string() }),
  ),
});

export type BidderPage = z.infer<typeof bidderPageSchema>;
export type BidderPackage = z.infer<typeof bidderPackageSchema>;
export type BidderSubmission = z.infer<typeof submissionSchema>;

// ---------------------------------------------------------------------------
// Edge functions
// ---------------------------------------------------------------------------
export interface InviteRecipient {
  email: string;
  company?: string | undefined;
}

export interface InviteBiddersInput {
  project_id: string;
  package_ids: string[];
  recipients: InviteRecipient[];
}

export const inviteBiddersResultSchema = z.object({
  invited: z.array(z.object({ email: z.string(), member_id: z.string(), link_url: z.string(), email_status: z.string() })),
  // The skipped shape is not pinned yet: accept an email string or an object with one.
  skipped: z
    .array(z.union([z.string(), z.object({ email: z.string(), reason: z.string().optional() }).passthrough()]))
    .catch([]),
});
export type InviteBiddersResult = z.infer<typeof inviteBiddersResultSchema>;
