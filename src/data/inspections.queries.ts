// Inspection reads (SPEC §13.2). The calendar is live: it refetches every 30 seconds while on screen.
// Requesters get other people's requests only through the calendar (calendar_inspections over ir_calendar: anonymized
// by the database). The deputy's calendar is his own: the OFS requests sent to OFS, nothing else (0061).
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import * as mockApi from './mock/api';
import * as mock from './mock/inspections';
import { isMock } from './mock';
import {
  IR_COLS,
  calendarRowSchema,
  formContextSchema,
  type CalendarRow,
  type FormContext,
  type IrEvent,
  type IrRecipient,
  type IrRequest,
} from './inspections.types';

const LIVE_MS = 30_000;

async function fetchCalendar(projectId: string, from: string, to: string): Promise<CalendarRow[]> {
  if (isMock()) return mock.calendar(projectId, from, to);
  // calendar_inspections is ir_calendar's rows plus whether an OFS request is with OFS (0061); the extra columns the
  // month calendar reads are dropped by the schema.
  const data: unknown = throwIfError(await supabase.rpc('calendar_inspections', { p_project_id: projectId, p_from: from, p_to: to }));
  return z.array(calendarRowSchema).parse(data);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The job's inspections from `from` to `to` (yyyy-MM-dd, both included), blocked time too. Waits for real days. */
export function useIrCalendar(projectId: string, from: string, to: string) {
  return useQuery({
    queryKey: qk.inspectionsPart(projectId, 'calendar', `${from}:${to}`),
    queryFn: DAY.test(from) && DAY.test(to) ? () => fetchCalendar(projectId, from, to) : skipToken,
    refetchInterval: LIVE_MS,
  });
}

async function fetchContext(projectId: string): Promise<FormContext> {
  if (isMock()) return mock.formContext(projectId);
  const data: unknown = throwIfError(await supabase.rpc('ir_form_context', { p_project_id: projectId }));
  return formContextSchema.parse(data);
}

/** What the request form prefills: GC, inspector, settings, kinds, companies (most-used first), today. */
export function useIrFormContext(projectId: string) {
  return useQuery({ queryKey: qk.inspectionsPart(projectId, 'context'), queryFn: () => fetchContext(projectId), staleTime: 60_000 });
}

async function fetchRequest(requestId: string): Promise<IrRequest | null> {
  if (isMock()) return mock.request(requestId);
  return throwIfErrorMaybe(await supabase.from('inspection_requests').select(IR_COLS).eq('id', requestId).maybeSingle());
}

/** One request in full (the requester's own, anyone's for the GC team and inspectors, an OFS request sent to OFS for
 *  the deputy). null = not visible. */
export function useIrRequest(projectId: string, requestId: string) {
  return useQuery({
    queryKey: qk.inspectionsPart(projectId, 'request', requestId),
    queryFn: () => fetchRequest(requestId),
    refetchInterval: LIVE_MS,
  });
}

async function fetchLog(projectId: string, from: string, to: string): Promise<IrRequest[]> {
  if (isMock()) return mock.list(projectId, (r) => r.status !== 'withdrawn' && r.request_date >= from && r.request_date <= to);
  return throwIfError(
    await supabase
      .from('inspection_requests')
      .select(IR_COLS)
      .eq('project_id', projectId)
      .neq('status', 'withdrawn')
      .gte('request_date', from)
      .lte('request_date', to)
      .order('number'),
  );
}

/** The inspection log for a period: every request RLS lets me read in full (my own, or all for the team). */
export function useIrLog(projectId: string, from: string, to: string) {
  return useQuery({ queryKey: qk.inspectionsPart(projectId, 'log', `${from}:${to}`), queryFn: () => fetchLog(projectId, from, to) });
}

async function fetchReview(projectId: string): Promise<IrRequest[]> {
  if (isMock()) return mock.list(projectId, (r) => r.status === 'gc_review');
  return throwIfError(
    await supabase.from('inspection_requests').select(IR_COLS).eq('project_id', projectId).eq('status', 'gc_review').order('request_date'),
  );
}

/** Requests waiting on the GC (the GC review list: the job has the GC step on, or takes OFS requests). */
export function useIrReview(projectId: string) {
  return useQuery({ queryKey: qk.inspectionsPart(projectId, 'review'), queryFn: () => fetchReview(projectId), refetchInterval: LIVE_MS });
}

async function fetchEvents(requestId: string): Promise<IrEvent[]> {
  if (isMock()) return mock.events(requestId);
  return throwIfError(
    await supabase.from('ir_events').select('id, created_at, actor_id, action').eq('request_id', requestId).order('id', { ascending: false }),
  );
}

/** A request's history, newest first. */
export function useIrEvents(projectId: string, requestId: string | null) {
  return useQuery({
    queryKey: qk.inspectionsPart(projectId, 'events', requestId ?? ''),
    queryFn: requestId ? () => fetchEvents(requestId) : skipToken,
  });
}

async function fetchRecipients(requestId: string): Promise<IrRecipient[]> {
  if (isMock()) return mock.recipients(requestId);
  return throwIfError(await supabase.rpc('ir_recipients', { p_request_id: requestId }));
}

/** Send results: who the picker offers, with the requester and the job team checked. */
export function useIrRecipients(projectId: string, requestId: string | null) {
  return useQuery({
    queryKey: qk.inspectionsPart(projectId, 'recipients', requestId ?? ''),
    queryFn: requestId ? () => fetchRecipients(requestId) : skipToken,
  });
}

async function fetchFileNames(ids: readonly string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  if (isMock()) {
    const rows = await Promise.all(ids.map((id) => mockApi.file(id)));
    return Object.fromEntries(rows.flatMap((r) => (r ? [[r.id, r.original_name] as const] : [])));
  }
  const rows = throwIfError(await supabase.from('files').select('id, original_name').in('id', [...ids]));
  return Object.fromEntries(rows.map((r) => [r.id, r.original_name] as const));
}

/** Names of a request's files that I can see (my own uploads, or the whole folder for the team). */
export function useIrFileNames(projectId: string, ids: readonly string[]) {
  return useQuery({
    queryKey: qk.inspectionsPart(projectId, 'file-names', ids.join(',')),
    queryFn: () => fetchFileNames(ids),
    staleTime: 60_000,
  });
}

async function fetchDecideRoles(): Promise<string[]> {
  if (isMock()) return ['inspector'];
  const rows = throwIfError(await supabase.from('role_permissions').select('role').eq('capability', 'ir.decide'));
  return rows.map((r) => r.role);
}

/** The roles that hold ir.decide (from the capability matrix, never a role name in code): who can be a co-inspector. */
export function useDecideRoles() {
  return useQuery({ queryKey: qk.decideRoles, queryFn: fetchDecideRoles, staleTime: Infinity });
}
