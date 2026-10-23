// OFS scheduling (0108). The fire marshal's schedule (ofs_schedule: every job where he decides OFS requests, or one, by
// day, plus the Asked ones with no time), live like the inspection calendar. His answers: Confirm (ir_confirm,
// inspections.decide) and Pick another time (ir_ofs_propose); the requester's Accept (ir_ofs_accept). Each is an IR
// RPC with the version check, so the open request and every inspections query (All my jobs' too) refresh after it.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { irRpc, useIrMutation, type IrRef } from './inspections.mutations';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/ofsSchedule';

const LIVE_MS = 30_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const scheduleRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  project_name: z.string(),
  timezone: z.string(),
  number: z.number(),
  ofs_number: z.number().nullable(),
  version: z.number(),
  request_date: z.string(),
  start_time: z.string().nullable(),
  duration_kind: z.string(),
  duration_min: z.number().nullable(),
  state: z.enum(['asked', 'confirmed', 'proposed', 'postponed', 'done', 'withdrawn']),
  needs_time: z.boolean(),
  place: z.string().nullable(),
  requester: z.string().nullable(),
  company: z.string(),
  sched_note: z.string().nullable(),
  sched_at: z.string().nullable(),
});
export type ScheduleRow = z.infer<typeof scheduleRowSchema>;

async function fetchSchedule(projectId: string | null, from: string, to: string): Promise<ScheduleRow[]> {
  if (isMock()) return mock.schedule(projectId, from, to);
  const args = { p_from: from, p_to: to, ...(projectId === null ? {} : { p_project_id: projectId }) };
  return z.array(scheduleRowSchema).parse(throwIfError(await supabase.rpc('ofs_schedule', args)));
}

/** The schedule's key sits under the job's inspections (one invalidation after any IR write); All my jobs under 'all'. */
function scheduleKey(projectId: string | null, from: string, to: string) {
  return qk.inspectionsPart(projectId ?? 'all', 'ofs-schedule', `${from}:${to}`);
}

export function useOfsSchedule(projectId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: scheduleKey(projectId, from, to),
    queryFn: DAY.test(from) && DAY.test(to) ? () => fetchSchedule(projectId, from, to) : skipToken,
    refetchInterval: LIVE_MS,
  });
}

interface ProposeInput {
  row: IrRef;
  date: string;
  /** "HH:mm", on the hour or half hour. */
  time: string;
  note: string;
}

/** Pick another time: the fire marshal's, on an OFS request sent to OFS. It waits on the requester's Accept. */
export function useProposeTime() {
  return useIrMutation((v: ProposeInput) => {
    const t = v.note.trim();
    return irRpc('ir_ofs_propose', {
      p_request_id: v.row.id,
      p_version: v.row.version,
      p_date: v.date,
      p_time: v.time,
      ...(t === '' ? {} : { p_note: t }),
    });
  });
}

/** Accept the fire marshal's time: the requester, the designated person or the inspector. */
export function useAcceptTime() {
  return useIrMutation((row: IrRef) => irRpc('ir_ofs_accept', { p_request_id: row.id, p_version: row.version }));
}
