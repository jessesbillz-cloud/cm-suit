// Deliveries shapes (SPEC §13.3). Rows derive from the generated types; the public link's answers are parsed with zod
// at the boundary (they come from an edge function), so a changed contract fails loudly here.
import { z } from 'zod';
import type { Database, Tables } from './database.types';

type Fns = Database['public']['Functions'];

/** One delivery as the app shows it: the row plus its company's name. */
export type DeliveryRow = Pick<
  Tables<'deliveries'>,
  | 'id'
  | 'project_id'
  | 'number'
  | 'delivery_date'
  | 'starts_at'
  | 'duration_min'
  | 'description'
  | 'standby'
  | 'posted_name'
  | 'via_link'
  | 'created_by'
  | 'created_at'
  | 'file_ids'
  | 'deleted_at'
  | 'deleted_name'
  | 'version'
> & { company: string };

export type CompanyOption = Fns['delivery_company_options']['Returns'][number];
export type HistoryLine = Fns['delivery_history']['Returns'][number];
export type ReviewRow = Pick<Tables<'delivery_reviews'>, 'id' | 'month' | 'name' | 'company' | 'created_at' | 'created_by'>;

export interface LinkState {
  active: boolean;
  /** When the current link was made (null when there is none). */
  since: string | null;
}

/** What a post or an edit sends. time null = time TBD (job clock, 24-hour 'HH:MM'). */
export interface DeliveryInput {
  company: string;
  date: string;
  time: string | null;
  duration_min: number;
  description: string;
}

// ---------------------------------------------------------------------------------------------------------------
// The public delivery link (edge function delivery-board): board fields only.
// ---------------------------------------------------------------------------------------------------------------
const boardDeliverySchema = z.object({
  number: z.number(),
  delivery_date: z.string(),
  starts_at: z.string().nullable(),
  duration_min: z.number(),
  company: z.string(),
  description: z.string(),
  standby: z.boolean(),
});
export type BoardDelivery = z.infer<typeof boardDeliverySchema>;

export const linkBoardSchema = z.object({
  project_name: z.string(),
  timezone: z.string(),
  companies: z.array(z.string()),
  deliveries: z.array(boardDeliverySchema),
});
export type LinkBoard = z.infer<typeof linkBoardSchema>;

export const linkReceiptSchema = boardDeliverySchema.extend({ id: z.string(), posted_name: z.string(), posted_at: z.string() });
export type LinkReceipt = z.infer<typeof linkReceiptSchema>;
