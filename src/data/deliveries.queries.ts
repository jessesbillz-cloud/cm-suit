// Deliveries reads (SPEC §13.3). RLS decides who sees them (deliveries.view); the link's board is in deliveryLink.ts.
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/deliveries';
import type { CompanyOption, DeliveryRow, HistoryLine, LinkState, ReviewRow } from './deliveries.types';

const COLS =
  'id, project_id, number, delivery_date, starts_at, duration_min, description, standby, posted_name, via_link, created_by, created_at, file_ids, deleted_at, deleted_name, version, delivery_companies(name)';

interface RawRow extends Omit<DeliveryRow, 'company'> {
  delivery_companies: { name: string } | null;
}

function toRow({ delivery_companies, ...r }: RawRow): DeliveryRow {
  return { ...r, company: delivery_companies?.name ?? '' };
}

async function fetchRange(projectId: string, from: string, to: string): Promise<DeliveryRow[]> {
  if (isMock()) return mock.list(projectId, from, to);
  const rows = throwIfError(
    await supabase
      .from('deliveries')
      .select(COLS)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .order('delivery_date')
      .order('starts_at', { nullsFirst: false })
      .order('number'),
  );
  return rows.map(toRow);
}

/** The live deliveries of a job between two days (inclusive). `refreshMs` for the TV (SPEC §13.3: every 30 seconds). */
export function useDeliveries(projectId: string, from: string, to: string, refreshMs?: number) {
  return useQuery({
    queryKey: qk.deliveriesPart(projectId, 'range', `${from}:${to}`),
    queryFn: () => fetchRange(projectId, from, to),
    refetchInterval: refreshMs ?? false,
    // Moving the three weeks keeps the old counts on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
}

async function fetchOne(id: string): Promise<DeliveryRow | null> {
  if (isMock()) return mock.get(id);
  const row = throwIfError(await supabase.from('deliveries').select(COLS).eq('id', id).limit(1))[0];
  return row ? toRow(row) : null;
}

/** One delivery, deleted ones included (so its pane can offer Undo). */
export function useDelivery(projectId: string, id: string) {
  return useQuery({ queryKey: qk.deliveriesPart(projectId, 'one', id), queryFn: () => fetchOne(id) });
}

/** The job's company list, most-used first. */
export function useDeliveryCompanies(projectId: string) {
  return useQuery({
    queryKey: qk.deliveriesPart(projectId, 'companies'),
    queryFn: async (): Promise<CompanyOption[]> =>
      isMock() ? mock.companies(projectId) : throwIfError(await supabase.rpc('delivery_company_options', { p_project_id: projectId })),
    staleTime: 60_000,
  });
}

export function useDeliveryHistory(projectId: string, id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.deliveriesPart(projectId, 'history', id),
    queryFn: enabled
      ? async (): Promise<HistoryLine[]> =>
          isMock() ? mock.history(id) : throwIfError(await supabase.rpc('delivery_history', { p_delivery_id: id }))
      : skipToken,
  });
}

/** "I reviewed this month" rows for one month ('yyyy-MM-01'). Readable with deliveries.manage. */
export function useDeliveryReviews(projectId: string, month: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.deliveriesPart(projectId, 'reviews', month),
    queryFn: enabled
      ? async (): Promise<ReviewRow[]> =>
          isMock()
            ? mock.reviews(projectId, month)
            : throwIfError(
                await supabase
                  .from('delivery_reviews')
                  .select('id, month, name, company, created_at, created_by')
                  .eq('project_id', projectId)
                  .eq('month', month)
                  .order('created_at'),
              )
      : skipToken,
  });
}

/** Is the job's delivery link on, and since when. deliveries.manage only. */
export function useDeliveryLinkState(projectId: string) {
  return useQuery({
    queryKey: qk.deliveriesPart(projectId, 'link'),
    queryFn: async (): Promise<LinkState> => {
      if (isMock()) return mock.linkState();
      const row = throwIfError(await supabase.rpc('delivery_link_state', { p_project_id: projectId }))[0];
      return { active: row?.active ?? false, since: row?.since ?? null };
    },
  });
}
