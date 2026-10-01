// RFI reads (the Sep 28 contract): the job's log, one RFI (reading it as the holder records the first open), the job's
// RFI settings, and what someone else is sitting on across my jobs. The database decides what comes back; zod checks it.
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockProgress from './mock/rfiProgress';
import * as mockRfis from './mock/rfis';
import {
  rfiDetailSchema,
  rfiListRowSchema,
  rfiProgressRowSchema,
  rfiSettingsSchema,
  rfiWaitingRowSchema,
  type RfiDetail,
  type RfiListRow,
  type RfiProgressRow,
  type RfiSettings,
  type RfiWaitingRow,
} from './rfis.types';

async function fetchList(projectId: string): Promise<RfiListRow[]> {
  if (isMock()) return mockRfis.list(projectId);
  const rows: unknown = throwIfError(await supabase.rpc('rfi_list', { p_project_id: projectId }));
  return z.array(rfiListRowSchema).parse(rows);
}

/** The job's RFIs I may see. The list, the reading pane's arrow keys and the board share it. */
export function useRfiList(projectId: string) {
  return useQuery({ queryKey: qk.rfisPart(projectId, 'list'), queryFn: () => fetchList(projectId) });
}

async function fetchDetail(rfiId: string): Promise<RfiDetail> {
  if (isMock()) return mockRfis.detail(rfiId);
  const data: unknown = throwIfError(await supabase.rpc('rfi_detail', { p_rfi_id: rfiId }));
  return rfiDetailSchema.parse(data);
}

/**
 * One RFI with its tracker, what I may do (can.*), its files and history. Reading it as the holder records the first
 * open: the log's line and the waiting list then refresh once, so "Not opened" goes away everywhere.
 */
export function useRfiDetail(projectId: string, rfiId: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.rfisPart(projectId, 'detail', rfiId),
    queryFn: async () => {
      const detail = await fetchDetail(rfiId);
      const line = qc.getQueryData<RfiListRow[]>(qk.rfisPart(projectId, 'list'))?.find((r) => r.id === rfiId);
      if (line && line.held_opened_at === null && detail.rfi.held_opened_at !== null) {
        void qc.invalidateQueries({ queryKey: qk.rfisPart(projectId, 'list') });
        void qc.invalidateQueries({ queryKey: qk.rfiWaiting });
      }
      return detail;
    },
  });
}

async function fetchProgress(projectId: string): Promise<RfiProgressRow[]> {
  if (isMock()) return mockProgress.progress(projectId);
  const rows: unknown = throwIfError(await supabase.rpc('rfi_progress', { p_project_id: projectId }));
  return z.array(rfiProgressRowSchema).parse(rows);
}

/** Every step of every RFI I may see on the job, with how long each sat there: the log's strips and the pane's. */
export function useRfiProgress(projectId: string) {
  return useQuery({ queryKey: qk.rfisPart(projectId, 'progress'), queryFn: () => fetchProgress(projectId) });
}

async function fetchSettings(projectId: string): Promise<RfiSettings> {
  if (isMock()) return mockRfis.settingsFor(projectId);
  const data: unknown = throwIfError(await supabase.rpc('rfi_settings_for', { p_project_id: projectId }));
  return rfiSettingsSchema.parse(data);
}

/** Answer due, impact window and the reviewers' route; a job without a row gets the defaults (version 0). */
export function useRfiSettings(projectId: string | null) {
  return useQuery({
    queryKey: qk.rfisPart(projectId ?? '', 'settings'),
    queryFn: projectId ? () => fetchSettings(projectId) : skipToken,
  });
}

async function fetchWaiting(): Promise<RfiWaitingRow[]> {
  if (isMock()) return mockRfis.waiting();
  const rows: unknown = throwIfError(await supabase.rpc('rfi_waiting'));
  return z.array(rfiWaitingRowSchema).parse(rows);
}

/** Late or unopened RFIs someone else holds, across all my jobs: late first, then oldest. */
export function useRfiWaiting() {
  return useQuery({ queryKey: qk.rfiWaiting, queryFn: fetchWaiting });
}
