// Sub directory shapes (SPEC §11.2). Rows derive from the generated types; contacts (jsonb) and the import answer are
// parsed with zod at the boundary, so a changed contract fails loudly here.
import { z } from 'zod';
import type { Tables } from './database.types';

const contactSchema = z.object({
  name: z.string().catch(''),
  email: z.string().catch(''),
  phone: z.string().catch(''),
  title: z.string().catch(''),
});
export type SubContact = z.infer<typeof contactSchema>;

/** Contacts live in jsonb; an entry that is not an object is dropped rather than breaking the directory. */
export const contactsSchema = z
  .array(contactSchema.nullable().catch(null))
  .catch([])
  .transform((xs) => xs.filter((x): x is SubContact => x !== null));

type SubTable = Tables<'subs'>;

export type SubRow = Omit<
  Pick<
    SubTable,
    | 'id'
    | 'org_id'
    | 'company'
    | 'trades'
    | 'contacts'
    | 'city'
    | 'zip'
    | 'region'
    | 'cslb_number'
    | 'cslb_status'
    | 'cslb_checked_at'
    | 'license_classes'
    | 'dir_number'
    | 'certifications'
    | 'notes'
    | 'version'
  >,
  'contacts'
> & { contacts: SubContact[] };

/** The fields a person edits in the pane (the CSLB result goes through record_cslb_check). */
export type SubPatch = Partial<
  Pick<SubRow, 'company' | 'trades' | 'contacts' | 'city' | 'zip' | 'region' | 'cslb_number' | 'license_classes' | 'dir_number' | 'certifications' | 'notes'>
>;

export const CSLB_RESULTS = ['active', 'inactive', 'suspended', 'expired'] as const;
export type CslbResult = (typeof CSLB_RESULTS)[number];

export interface SubHistoryRow {
  id: number;
  at: string;
  kind: string;
  /** The job's name, or null when the caller can't see that job. */
  job: string | null;
}

export const importResultSchema = z.object({
  rows: z.number(),
  companies: z.number(),
  added: z.number(),
  updated: z.number(),
  unchanged: z.number(),
});
export type ImportResult = z.infer<typeof importResultSchema>;
