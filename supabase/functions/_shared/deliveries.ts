// The delivery link's contract (SPEC §6.4 #3, §13.3): what a request may carry and what an answer may contain.
// Pure (no I/O), so the whitelist is unit-tested (deliveries_test.ts). The SQL side (link_* in migration 0025) already
// returns board fields only; the function passes everything through these projections as well, so a later change to
// the SQL can never widen what the public link sees.
import { uuid, z } from './validate.ts';

/** 32 random bytes as base64url: the shape rotate_delivery_link hands out. */
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Malformed token');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-mm-dd');
const clean = (max: number) => z.string().trim().min(1).max(max);

const base = { project_id: uuid, token };

export const DeliveryBoardBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('board'), ...base, from: day, to: day }).strict(),
  z.object({
    action: z.literal('post'),
    ...base,
    name: clean(120),
    company: clean(120),
    date: day,
    /** Job-clock time, 24-hour; null = time TBD. */
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM').nullable(),
    duration_min: z.number().int().min(5).max(720),
    description: clean(500),
  }).strict(),
  z.object({ action: z.literal('receipt'), ...base, delivery_id: uuid }).strict(),
]);
export type DeliveryBoardRequest = z.infer<typeof DeliveryBoardBody>;

/** Board fields: the only per-delivery data the link ever sees. */
const BoardDelivery = z.object({
  number: z.number().int(),
  delivery_date: day,
  starts_at: z.string().nullable(),
  duration_min: z.number().int(),
  company: z.string(),
  description: z.string(),
  standby: z.boolean(),
});

const Board = z.object({
  project_name: z.string(),
  timezone: z.string(),
  companies: z.array(z.string()),
  deliveries: z.array(BoardDelivery),
});

const Receipt = BoardDelivery.extend({ id: uuid, posted_name: z.string(), posted_at: z.string() });

export type BoardAnswer = z.infer<typeof Board>;
export type ReceiptAnswer = z.infer<typeof Receipt>;

/** Re-projects the board (zod object parsing drops every key not listed above). */
export function boardAnswer(raw: unknown): BoardAnswer {
  return Board.parse(raw);
}

/** Re-projects a receipt: board fields plus its id (to fetch it again), the typed name and the time it was posted. */
export function receiptAnswer(raw: unknown): ReceiptAnswer {
  return Receipt.parse(raw);
}
