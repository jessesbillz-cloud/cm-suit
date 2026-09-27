// Sub directory reads (SPEC §11.2). Org-level; RLS decides who sees it (org members and directory managers).
import { skipToken, useQuery } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockSubs from './mock/subs';
import { contactsSchema, type SubHistoryRow, type SubRow } from './subs.types';

export const SUB_COLS =
  'id, org_id, company, trades, contacts, city, zip, region, cslb_number, cslb_status, cslb_checked_at, license_classes, dir_number, certifications, notes, version';

/** PostgREST answers at most max_rows (supabase/config.toml) per request; the directory is read in pages of that. */
const PAGE = 1000;

const byCompany = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** A row as selected with SUB_COLS, contacts parsed. */
export function toSubRow(raw: Omit<SubRow, 'contacts'> & { contacts: unknown }): SubRow {
  return { ...raw, contacts: contactsSchema.parse(raw.contacts) };
}

async function fetchSubs(orgId: string): Promise<SubRow[]> {
  if (isMock()) return mockSubs.list(orgId);
  const out: SubRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = throwIfError(
      await supabase
        .from('subs')
        .select(SUB_COLS)
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('id')
        .range(from, from + PAGE - 1),
    );
    out.push(...rows.map(toSubRow));
    if (rows.length < PAGE) break;
  }
  return out.sort((a, b) => byCompany.compare(a.company, b.company));
}

/** The whole directory of an org, sorted by company. About 1,600 rows for a full master list. */
export function useSubs(orgId: string | undefined) {
  return useQuery({
    queryKey: qk.subs(orgId ?? ''),
    queryFn: orgId !== undefined ? () => fetchSubs(orgId) : skipToken,
    staleTime: 60_000,
  });
}

async function fetchHistory(subId: string): Promise<SubHistoryRow[]> {
  if (isMock()) return mockSubs.history(subId);
  const rows = throwIfError(
    await supabase
      .from('sub_history')
      .select('id, at, kind, projects(name)')
      .eq('sub_id', subId)
      .order('at', { ascending: false })
      .limit(200),
  );
  return rows.map((r) => ({ id: r.id, at: r.at, kind: r.kind, job: r.projects?.name ?? null }));
}

/** Invites, bids and awards for one sub, newest first, with the job's name where the caller can see the job. */
export function useSubHistory(orgId: string, subId: string) {
  return useQuery({
    queryKey: qk.subHistory(orgId, subId),
    queryFn: () => fetchHistory(subId),
  });
}
