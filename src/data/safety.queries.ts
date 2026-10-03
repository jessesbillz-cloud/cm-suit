// Safety reads (migration 0060): a job's meetings, one meeting, the lines on its sheet (live while it is open: a crew
// signs from the QR), the topic library a job sees (the starters and its company's own; RLS by company) and when the
// next tailgate is due. Everything a job shows sits under qk.safety(job), so one refresh after any write.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { DataError, throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/safety';
import {
  dueSchema,
  meetingRowSchema,
  meetingSchema,
  SIGNIN_COLS,
  SIGNIN_COLS_FULL,
  signinSchema,
  TOPIC_COLS,
  topicSchema,
  type Meeting,
  type MeetingRow,
  type SafetyDue,
  type Signin,
  type Topic,
} from './safety.types';

/** The roster refreshes this often while the meeting is open and on screen. */
const LIVE_MS = 4000;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new DataError('That item no longer exists.', 'PGRST116', null);
  return row;
}

async function fetchMeetings(projectId: string): Promise<MeetingRow[]> {
  if (isMock()) return mock.meetings(projectId);
  const rows: unknown = throwIfError(await supabase.rpc('safety_meetings_list', { p_project_id: projectId }));
  return z.array(meetingRowSchema).parse(rows);
}

/** The job's meetings, newest first, each with how many are on its sheet. */
export function useSafetyMeetings(projectId: string) {
  return useQuery({ queryKey: qk.safetyPart(projectId, 'meetings'), queryFn: () => fetchMeetings(projectId) });
}

async function fetchMeeting(meetingId: string): Promise<Meeting> {
  if (isMock()) return mock.meeting(meetingId);
  const rows: unknown = throwIfError(await supabase.rpc('safety_meeting', { p_meeting_id: meetingId }));
  return first(z.array(meetingSchema).parse(rows));
}

/** One meeting: its outline, who leads it, open or closed, its sheet. Refreshes while open (a close from elsewhere). */
export function useSafetyMeeting(projectId: string, meetingId: string) {
  return useQuery({
    queryKey: qk.safetyPart(projectId, 'meeting', meetingId),
    queryFn: () => fetchMeeting(meetingId),
    refetchInterval: (q) => (q.state.data?.status === 'open' ? 15_000 : false),
  });
}

async function fetchRoster(meetingId: string, full: boolean): Promise<Signin[]> {
  if (isMock()) return mock.roster(meetingId, full);
  const rows: unknown = throwIfError(
    await supabase
      .from('safety_signins')
      .select(full ? SIGNIN_COLS_FULL : SIGNIN_COLS)
      .eq('meeting_id', meetingId)
      .is('removed_at', null)
      .order('created_at')
      .order('id'),
  );
  return z.array(signinSchema).parse(rows);
}

/**
 * The lines on a meeting's sheet. Live (every few seconds, without the strokes) while it is open; a closed meeting's
 * sheet once, with each signature. `open` null: the meeting is not loaded yet.
 */
export function useSafetyRoster(projectId: string, meetingId: string, open: boolean | null) {
  return useQuery({
    queryKey: qk.safetyPart(projectId, open ? 'roster' : 'sheet', meetingId),
    queryFn: open === null ? skipToken : () => fetchRoster(meetingId, !open),
    refetchInterval: open ? LIVE_MS : false,
  });
}

async function fetchTopics(orgId: string): Promise<Topic[]> {
  if (isMock()) return mock.topics();
  const rows: unknown = throwIfError(
    await supabase
      .from('safety_topics')
      .select(TOPIC_COLS)
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .is('deleted_at', null)
      .order('title'),
  );
  return z.array(topicSchema).parse(rows);
}

/** The library a job sees: the built-in starters and its company's own talks. `orgId` null: not yet known. */
export function useSafetyTopics(orgId: string | null) {
  return useQuery({
    queryKey: qk.safetyTopics(orgId ?? ''),
    queryFn: orgId ? () => fetchTopics(orgId) : skipToken,
    staleTime: 5 * 60_000,
  });
}

async function fetchDue(projectId: string): Promise<SafetyDue> {
  if (isMock()) return mock.due(projectId);
  const rows: unknown = throwIfError(await supabase.rpc('safety_due', { p_project_id: projectId }));
  return first(z.array(dueSchema).parse(rows));
}

/** When the next tailgate is due (every 10 working days, the job's clock) and how many meetings are open. */
export function useSafetyDue(projectId: string) {
  return useQuery({ queryKey: qk.safetyPart(projectId, 'due'), queryFn: () => fetchDue(projectId) });
}
