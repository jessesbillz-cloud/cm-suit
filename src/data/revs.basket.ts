// The request being built (migration 0113; Jesse, Oct 23: "walk up to the wall ... click the button - and that gets added
// to the inspection request"): one per person and job, on the server, so it follows him from the phone to the iPad.
// Add / Take out are set changes by wall x item (safe to repeat), Add for a whole room is the same call with the room.
// What Send would file comes from the database (one OFS request per item and sheet page, each with the OFS number it
// would get); Send carries the version reviewed and answers the batch. ir_batches tells the schedule and the start page
// which requests went together. Every answer is parsed with zod.
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/revBasket';
import { useRefreshRequest } from './revs.mutations';

const cellSchema = z.object({ area_id: z.string(), item_id: z.string() });

const basketSchema = z.object({
  /** 0: none yet. Send carries it. */
  version: z.number().int(),
  cells: z.array(cellSchema),
  /** What Send files, in order: one request per item and sheet page, with the OFS number it would get. */
  groups: z.array(z.object({ item_id: z.string(), area_ids: z.array(z.string()), ofs_number: z.number().int() })),
  /** May type the OFS numbers (whoever sends OFS requests, 0091). */
  may_number: z.boolean(),
});
export type Basket = z.infer<typeof basketSchema>;
export type BasketCell = z.infer<typeof cellSchema>;

const batchSchema = z.object({
  batch_id: z.string(),
  requests: z.array(
    z.object({ id: z.string(), number: z.number().int(), ofs_number: z.number().int().nullable(), items: z.string(), status: z.string(), version: z.number().int() }),
  ),
});
export type Batch = z.infer<typeof batchSchema>;

const basketKey = (projectId: string) => qk.revsPart(projectId, 'basket');

async function fetchBasket(projectId: string): Promise<Basket> {
  if (isMock()) return mock.get(projectId);
  return basketSchema.parse(throwIfError(await supabase.rpc('rev_basket_get', { p_project_id: projectId })));
}

/** My request being built on this job; `enabled` false for those who don't file OFS requests. */
export function useRevBasket(projectId: string, enabled: boolean) {
  return useQuery({ queryKey: basketKey(projectId), queryFn: enabled ? () => fetchBasket(projectId) : skipToken });
}

interface CellsInput {
  projectId: string;
  areaIds: readonly string[];
  itemIds: readonly string[];
  /** Add only: every wall of this room (its card's walls). */
  roomId?: string | undefined;
}

/** The answer of Add / Take out: the basket, and how many cells it changed. */
const changedSchema = basketSchema.extend({ added: z.number().int().optional(), removed: z.number().int().optional() });
export type BasketChange = z.infer<typeof changedSchema>;

function useBasketWrite(run: (v: CellsInput) => Promise<BasketChange>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (b, v) => {
      qc.setQueryData<Basket>(basketKey(v.projectId), { version: b.version, cells: b.cells, groups: b.groups, may_number: b.may_number });
    },
    onError: (_e, v) => qc.invalidateQueries({ queryKey: basketKey(v.projectId) }),
  });
}

export function useBasketAdd() {
  return useBasketWrite(async (v) => {
    if (isMock()) return mock.add(v.projectId, v.areaIds, v.itemIds, v.roomId);
    const data: unknown = throwIfError(
      await supabase.rpc('rev_basket_add', {
        p_project_id: v.projectId,
        p_area_ids: [...v.areaIds],
        p_item_ids: [...v.itemIds],
        ...(v.roomId ? { p_room_id: v.roomId } : {}),
      }),
    );
    return changedSchema.parse(data);
  });
}

export function useBasketRemove() {
  return useBasketWrite(async (v) => {
    if (isMock()) return mock.remove(v.projectId, v.areaIds, v.itemIds);
    const data: unknown = throwIfError(
      await supabase.rpc('rev_basket_remove', { p_project_id: v.projectId, p_area_ids: [...v.areaIds], p_item_ids: [...v.itemIds] }),
    );
    return changedSchema.parse(data);
  });
}

export interface BasketSend {
  projectId: string;
  version: number;
  company: string;
  date: string;
  /** "HH:mm", or null for Flexible. */
  startTime: string | null;
  durationKind: 'timed' | 'all_day' | 'periodic';
  durationMin: number | null;
  noticeAck: boolean;
  specialRequired: boolean;
  inspectorAck: boolean;
  /** Typed by whoever sends OFS requests, one per request in order; null: the database's. */
  ofsNumbers: number[] | null;
}

/** Send: one OFS request per item and sheet page, as one batch; the basket is empty after. */
export function useBasketSend() {
  const qc = useQueryClient();
  const refresh = useRefreshRequest();
  return useMutation({
    mutationFn: async (v: BasketSend): Promise<Batch> => {
      if (isMock()) return mock.send(v);
      const data: unknown = throwIfError(
        await supabase.rpc('rev_basket_send', {
          p_project_id: v.projectId,
          p_version: v.version,
          p_company: v.company.trim(),
          p_request_date: v.date,
          p_duration_kind: v.durationKind,
          p_notice_ack: v.noticeAck,
          p_special_required: v.specialRequired,
          p_inspector_ack: v.inspectorAck,
          ...(v.startTime !== null ? { p_start_time: v.startTime } : {}),
          ...(v.durationMin !== null ? { p_duration_min: v.durationMin } : {}),
          ...(v.ofsNumbers !== null ? { p_ofs_numbers: v.ofsNumbers } : {}),
        }),
      );
      return batchSchema.parse(data);
    },
    onSettled: (_b, _e, v) => Promise.all([refresh(v.projectId, null), qc.invalidateQueries({ queryKey: ['ir_batches'] })]),
  });
}

const batchRowSchema = z.object({ request_id: z.string(), batch_id: z.string(), size: z.number().int() });
export type BatchOf = ReadonlyMap<string, { batchId: string; size: number }>;

async function fetchBatches(ids: readonly string[]): Promise<BatchOf> {
  const rows = isMock()
    ? await mock.batches(ids)
    : z.array(batchRowSchema).parse(throwIfError(await supabase.rpc('ir_batches', { p_request_ids: [...ids] })));
  return new Map(rows.map((r) => [r.request_id, { batchId: r.batch_id, size: r.size }]));
}

/** Which of these requests went together (a batch from the request being built). */
export function useIrBatches(requestIds: readonly string[]) {
  const ids = [...new Set(requestIds)].sort();
  return useQuery({ queryKey: ['ir_batches', ...ids], queryFn: ids.length > 0 ? () => fetchBatches(ids) : skipToken });
}
