// Photos and one-line notes of a wall, a room, or a wall on an inspection request (migration 0102; Jesse, Oct 12: "send
// him out with an iPad: go take a picture of all our walls the way they are right now ... on the inspection request ...
// attach a photo, or add a comment, a note"). The files go to the app's own folder (Wall photos, made on first use,
// hidden from Files), never to To sort: a photo belongs to the wall it is of. A request's photo is the wall's photo too
// (one row). Reads: rev_photos_list (what I may see, newest first, with who and whether I may remove it). Writes: add
// (one row per photo, the note on each, or the note alone), remove (Undo: restore). Every write refreshes the job's revs.
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useUser } from './auth';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/revPhotos';
import { uploadFile } from './upload';

const photoSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  area_id: z.string().nullable(),
  room_id: z.string().nullable(),
  request_id: z.string().nullable(),
  ir_number: z.number().int().nullable(),
  ofs_number: z.number().int().nullable(),
  file_id: z.string().nullable(),
  file_name: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
  by_name: z.string(),
  mine: z.boolean(),
  can_remove: z.boolean(),
  /** On a decided request: part of its record. */
  locked: z.boolean(),
  /** I read it through its request (not its folder): it opens through the request's gate. */
  via_request: z.boolean(),
});
export type RevPhoto = z.infer<typeof photoSchema>;

const rowSchema = z.object({ id: z.string(), version: z.number().int() });

/** Whose photos: a wall's, a room's (its own and its walls'), or a request's. */
export type PhotoTarget = { areaId: string } | { roomId: string } | { requestId: string };

/** Where a new photo goes: the wall (and the room it was taken in), the room alone, or a wall on a request. */
export interface PhotoPlace {
  areaId: string | null;
  roomId: string | null;
  requestId: string | null;
}

function targetArgs(t: PhotoTarget) {
  return {
    p_area_id: 'areaId' in t ? t.areaId : null,
    p_room_id: 'roomId' in t ? t.roomId : null,
    p_request_id: 'requestId' in t ? t.requestId : null,
  };
}

function targetKey(t: PhotoTarget): string {
  if ('areaId' in t) return `photos:wall:${t.areaId}`;
  return 'roomId' in t ? `photos:room:${t.roomId}` : `photos:request:${t.requestId}`;
}

/** A SQL null for an argument the generated types call required (PostgREST passes JSON null through). */
function sqlNull<T>(v: T | null): T {
  return v as T;
}

async function fetchPhotos(projectId: string, t: PhotoTarget): Promise<RevPhoto[]> {
  if (isMock()) return z.array(photoSchema).parse(await mock.list(projectId, t));
  const a = targetArgs(t);
  const data = throwIfError(
    await supabase.rpc('rev_photos_list', {
      p_project_id: projectId,
      p_area_id: sqlNull(a.p_area_id),
      p_room_id: sqlNull(a.p_room_id),
      p_request_id: sqlNull(a.p_request_id),
    }),
  );
  return z.array(photoSchema).parse(data);
}

/** The photos I may see there, newest first. */
export function useRevPhotos(projectId: string, target: PhotoTarget) {
  return useQuery({ queryKey: qk.revsPart(projectId, targetKey(target)), queryFn: () => fetchPhotos(projectId, target) });
}

async function fetchMayAdd(projectId: string, requestId: string | null): Promise<boolean> {
  if (isMock()) return mock.mayAdd(projectId, requestId);
  return z.boolean().parse(throwIfError(await supabase.rpc('rev_photo_may_add', { p_project_id: projectId, p_request_id: sqlNull(requestId) })));
}

/** May I add photos to the walls (no request), or on this request? */
export function useRevPhotoMayAdd(projectId: string, requestId: string | null) {
  return useQuery({ queryKey: qk.revsPart(projectId, `photos:may:${requestId ?? 'walls'}`), queryFn: () => fetchMayAdd(projectId, requestId) });
}

async function fetchFolder(projectId: string): Promise<string> {
  if (isMock()) return mock.folder(projectId);
  return z.string().parse(throwIfError(await supabase.rpc('rev_photos_folder', { p_project_id: projectId })));
}

/** Uploads one compressed photo into the job's Wall photos (asked once a session) and resolves to its file id. */
export function useRevPhotoUpload() {
  const user = useUser();
  const qc = useQueryClient();
  const userId = user.id;
  return useCallback(
    async (projectId: string, file: File, signal: AbortSignal): Promise<string> => {
      const folderId = await qc.query({ queryKey: qk.revsPart(projectId, 'photos:folder'), queryFn: () => fetchFolder(projectId), staleTime: Infinity });
      const { fileId } = await uploadFile({ file, projectId, folderId, userId, signal, onProgress: () => undefined });
      return fileId;
    },
    [qc, userId],
  );
}

async function addOne(projectId: string, at: PhotoPlace, fileId: string | null, note: string | null): Promise<void> {
  if (isMock()) {
    await mock.add(projectId, at, fileId, note);
    return;
  }
  rowSchema.parse(
    throwIfError(
      await supabase.rpc('rev_photo_add', {
        p_project_id: projectId,
        p_area_id: sqlNull(at.areaId),
        p_room_id: sqlNull(at.roomId),
        p_request_id: sqlNull(at.requestId),
        p_file_id: sqlNull(fileId),
        p_note: sqlNull(note),
      }),
    ),
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return (projectId: string) => qc.invalidateQueries({ queryKey: qk.revs(projectId) });
}

/** The photos just taken (their file ids), each with the note, or the note alone. Safe to repeat. */
export function useAddRevPhotos() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; at: PhotoPlace; fileIds: readonly string[]; note: string }) => {
      const note = v.note.trim() === '' ? null : v.note.trim();
      if (v.fileIds.length === 0) await addOne(v.projectId, v.at, null, note);
      for (const id of v.fileIds) await addOne(v.projectId, v.at, id, note);
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** Removed (`back` false, version-checked) or brought back (the Undo). Answers the row's new version. */
export function useSetRevPhoto() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; photo: RevPhoto; back: boolean }): Promise<number> => {
      if (isMock()) return mock.setRemoved(v.photo.id, v.photo.version, !v.back);
      if (v.back) return rowSchema.parse(throwIfError(await supabase.rpc('rev_photo_restore', { p_id: v.photo.id }))).version;
      return rowSchema.parse(throwIfError(await supabase.rpc('rev_photo_remove', { p_id: v.photo.id, p_version: v.photo.version }))).version;
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}
