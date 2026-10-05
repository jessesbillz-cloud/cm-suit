// Safety writes (migration 0060). Every write is its own RPC run as me (start, a new QR, tick in, remove a line, Undo a
// close, the library), version-checked where it takes one; Close and the sheet go through the safety-meeting function
// (the PDF is made on the server from the saved sheet). A start, a new QR and a reopen hand out the sign-in token once;
// the screen keeps it on this device (lib/requestLink). Every write refreshes the job's safety queries, the board, the
// tasks (Needs you and the rail badges) and the calendar.
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { saveFile } from '../lib/saveFile';
import { useUser } from './auth';
import { supabase } from './client';
import { downloadFile } from './download';
import { DataError, throwIfError, throwIfErrorMaybe } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/safety';
import {
  linkTokenSchema,
  reopenedSchema,
  sheetFileSchema,
  startedSchema,
  type LinkToken,
  type Reopened,
  type StartInput,
  type Started,
  type Topic,
  type TopicInput,
} from './safety.types';
import { uploadFile } from './upload';

/** A SQL null for an argument the generated types call required (PostgREST passes JSON null through). */
function sqlNull<T>(v: T | null): T {
  return v as T;
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new DataError('The server answered nothing.', null, null);
  return row;
}

/** A safety write can close tasks, post a board line and move a calendar line (0060): refresh all of them with the job's safety. */
function useRefresh(projectId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.safety(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(null) }),
      qc.invalidateQueries({ queryKey: qk.tasksAll }),
      qc.invalidateQueries({ queryKey: qk.calendar }),
    ]);
}

/** Start a meeting (safety.run): the next number, me leading, the sign-in token once. */
export function useStartMeeting(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (v: StartInput): Promise<Started> => {
      if (isMock()) return mock.start(projectId, v);
      const rows: unknown = throwIfError(
        await supabase.rpc('safety_meeting_start', {
          p_project_id: projectId, p_key: v.key, p_kind: v.kind, p_topic_id: sqlNull(v.topicId), p_title: v.title, p_notes: v.notes,
          p_file_id: sqlNull(v.fileId), p_location: v.location,
        }),
      );
      return first(z.array(startedSchema).parse(rows));
    },
    onSettled: refresh,
  });
}

/** A new QR for an open meeting: the old link stops at once. */
export function useMeetingQr(projectId: string, meetingId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (): Promise<LinkToken> => {
      if (isMock()) return mock.qr(meetingId);
      const rows: unknown = throwIfError(await supabase.rpc('safety_meeting_qr', { p_meeting_id: meetingId }));
      return first(z.array(linkTokenSchema).parse(rows));
    },
    onSettled: refresh,
  });
}

/** Tick a job member in (the leader, or a safety manager). The same person twice is one line. */
export function useTickIn(projectId: string, meetingId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (personId: string): Promise<void> => {
      if (isMock()) return mock.tick(meetingId, personId);
      throwIfError(await supabase.rpc('safety_tick', { p_meeting_id: meetingId, p_person: personId }));
    },
    onSettled: refresh,
  });
}

/** Take a line off the sheet, or put it back (Undo). */
export function useRemoveLine(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (v: { signinId: string; removed: boolean }): Promise<void> => {
      if (isMock()) return mock.removeLine(v.signinId, v.removed);
      throwIfErrorMaybe(await supabase.rpc('safety_signin_remove', { p_signin_id: v.signinId, p_removed: v.removed }));
    },
    onSettled: refresh,
  });
}

const sheetAnswer = sheetFileSchema;

/** Close (with the meeting's version), then the server makes the sign-in sheet PDF. Answers the sheet's file id. */
export function useCloseMeeting(projectId: string, meetingId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (version: number): Promise<string> => {
      if (isMock()) return (await mock.close(meetingId, version)).file_id;
      return (await callFunction('safety-meeting', { action: 'close', meeting_id: meetingId, version }, sheetAnswer)).file_id;
    },
    onSettled: refresh,
  });
}

/** Make the sheet PDF of a closed meeting again (when the first try after Close failed). */
export function useMakeSheet(projectId: string, meetingId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (): Promise<string> => {
      if (isMock()) return (await mock.render(meetingId)).file_id;
      return (await callFunction('safety-meeting', { action: 'render', meeting_id: meetingId }, sheetAnswer)).file_id;
    },
    onSettled: refresh,
  });
}

/** Undo a close (the one who closed it, within 15 minutes): open again with a new QR. */
export function useReopenMeeting(projectId: string, meetingId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: async (): Promise<Reopened> => {
      if (isMock()) return mock.reopen(meetingId);
      const rows: unknown = throwIfError(await supabase.rpc('safety_meeting_reopen', { p_meeting_id: meetingId }));
      return first(z.array(reopenedSchema).parse(rows));
    },
    onSettled: refresh,
  });
}

/** Downloads a meeting's sign-in sheet: the one download path, a fresh signed URL, logged. */
export async function downloadSheet(fileId: string): Promise<void> {
  if (isMock()) {
    const { blob, filename } = await mock.fileBlob(fileId);
    await saveFile(blob, filename);
    return;
  }
  await downloadFile(fileId);
}

const topicFileSchema = z.object({ url: z.string().url(), filename: z.string().min(1) });

/** Opens a library topic's PDF through its own gate (logged as a download). */
export async function downloadTopicFile(projectId: string, topicId: string): Promise<void> {
  if (isMock()) {
    const { blob, filename } = await mock.fileBlob(topicId);
    await saveFile(blob, filename);
    return;
  }
  const res = await callFunction('safety-meeting', { action: 'topic_file', project_id: projectId, topic_id: topicId }, topicFileSchema);
  await saveFile(res.url, res.filename);
}

const savedTopicSchema = z.object({ id: z.string(), version: z.number().int() });

/** Add or change one of the company's topics (safety.manage), with its version. */
export function useSaveTopic(projectId: string, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: TopicInput): Promise<{ id: string; version: number }> => {
      if (isMock()) return mock.saveTopic(v);
      const rows: unknown = throwIfError(
        await supabase.rpc('safety_topic_save', {
          p_project_id: projectId, p_id: sqlNull(v.id), p_version: sqlNull(v.version), p_category: v.category, p_title: v.title,
          p_points: v.points, p_questions: v.questions, p_source: v.source, p_source_url: v.sourceUrl, p_file_id: sqlNull(v.fileId),
        }),
      );
      return first(z.array(savedTopicSchema).parse(rows));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.safetyTopics(orgId) }),
  });
}

/** Remove one of the company's topics, or put it back (Undo). */
export function useRemoveTopic(projectId: string, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { topic: Topic; removed: boolean }): Promise<void> => {
      if (isMock()) return mock.removeTopic(v.topic.id, v.removed, v.topic);
      throwIfError(await supabase.rpc('safety_topic_remove', { p_project_id: projectId, p_id: v.topic.id, p_removed: v.removed }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.safetyTopics(orgId) }),
  });
}

async function safetyFolder(projectId: string): Promise<string> {
  if (isMock()) return mock.folder(projectId);
  return z.string().parse(throwIfError(await supabase.rpc('safety_folder', { p_project_id: projectId })));
}

/** Uploads one PDF (an own talk) into the job's Safety folder and resolves to its file id. */
export function useSafetyUpload(projectId: string) {
  const user = useUser();
  const qc = useQueryClient();
  const userId = user.id;
  return useCallback(
    async (file: File, signal: AbortSignal): Promise<string> => {
      const folderId = await qc.query({
        queryKey: qk.safetyPart(projectId, 'folder'),
        queryFn: () => safetyFolder(projectId),
        staleTime: Infinity,
      });
      const { fileId } = await uploadFile({ file, projectId, folderId, userId, signal, onProgress: () => undefined });
      return fileId;
    },
    [qc, projectId, userId],
  );
}
