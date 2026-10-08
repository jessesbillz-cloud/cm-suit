// Rooms (migration 0083; Jesse, Oct 5: "Room and then you click on the room and it breaks it down into the walls"). A
// list's rooms on each level (a room, the level's exterior walls, or a shaft), each with its cropped plan image and its
// walls, each wall with its line on that image (none until drawn). A wall may be in several rooms. Reads: the tables
// (RLS: revs.read). Writes (revs.manage): a room's number and name (version-checked), a wall in or out of a room (each
// the other's Undo, the line kept), a wall's line (Undo sends the old one back), a room's picture from its page (0094),
// and the job's pictures and OFS IRs added from Revs into the app's own folders (Room pictures, Reports / OFS history),
// each linked as soon as it is stored (rev_file_link). Link files links again by name: the rooms' pictures, the
// sign-offs' OFS IRs and the walls' plan sheets. The rooms themselves are loaded in one call (rev_rooms_load), not from
// a screen. Every write refreshes the job's revs.
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useUser } from './auth';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockFiles from './mock/revFiles';
import * as mockRooms from './mock/revRooms';
import { wallLineSchema, type WallLine } from './revs.types';
import { uploadFile } from './upload';

const REV_ROOM_COLS = 'id, project_id, list_id, level, number, name, kind, image_name, image_file_id, position, version, deleted_at';
const REV_ROOM_WALL_COLS = 'id, project_id, room_id, area_id, line, position, version, deleted_at';

const roomSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  list_id: z.string(),
  level: z.string(),
  number: z.string(),
  name: z.string(),
  kind: z.enum(['room', 'exterior', 'shaft']),
  /** The picture's file name (0083's load, or the picture added on the room's page). */
  image_name: z.string().nullable(),
  image_file_id: z.string().nullable(),
  position: z.number().int(),
  version: z.number().int(),
  deleted_at: z.string().nullable(),
});
export type RevRoom = z.infer<typeof roomSchema>;

const roomWallSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  room_id: z.string(),
  area_id: z.string(),
  line: wallLineSchema.nullable(),
  position: z.number().int(),
  version: z.number().int(),
  deleted_at: z.string().nullable(),
});
export type RevRoomWall = z.infer<typeof roomWallSchema>;

export interface RevRooms {
  rooms: RevRoom[];
  walls: RevRoomWall[];
}

/** Live rows only: rooms by place then number, each room's walls by place; walls of a removed room are dropped. */
function liveRooms(raw: { rooms: unknown[]; walls: unknown[] }): RevRooms {
  const rooms = z
    .array(roomSchema)
    .parse(raw.rooms)
    .filter((r) => r.deleted_at === null)
    .sort((a, b) => a.position - b.position || a.number.localeCompare(b.number, undefined, { numeric: true }) || a.id.localeCompare(b.id));
  const ids = new Set(rooms.map((r) => r.id));
  const walls = z
    .array(roomWallSchema)
    .parse(raw.walls)
    .filter((w) => w.deleted_at === null && ids.has(w.room_id))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return { rooms, walls };
}

async function fetchRooms(projectId: string): Promise<RevRooms> {
  if (isMock()) return liveRooms(await mockRooms.rooms(projectId));
  const [rooms, walls] = await Promise.all([
    supabase.from('rev_rooms').select(REV_ROOM_COLS).eq('project_id', projectId),
    supabase.from('rev_room_walls').select(REV_ROOM_WALL_COLS).eq('project_id', projectId),
  ]);
  return liveRooms({ rooms: throwIfError(rooms), walls: throwIfError(walls) });
}

/** The job's rooms and their walls (live, in order). */
export function useRevRooms(projectId: string) {
  return useQuery({ queryKey: qk.revsPart(projectId, 'rooms'), queryFn: () => fetchRooms(projectId) });
}

/** A SQL null for an argument the generated types call required (PostgREST passes JSON null through). */
function sqlNull<T>(v: T | null): T {
  return v as T;
}

function one<T>(data: T | T[]): T {
  return Array.isArray(data) ? (data[0] as T) : data;
}

function useRefresh() {
  const qc = useQueryClient();
  return (projectId: string) => qc.invalidateQueries({ queryKey: qk.revs(projectId) });
}

/** A room's number and name (revs.manage), version-checked. */
export function useSaveRoom() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { room: RevRoom; number: string; name: string }): Promise<RevRoom> => {
      if (isMock()) return mockRooms.save(v.room, v.number, v.name);
      const data = throwIfError(
        await supabase.rpc('rev_room_save', { p_id: v.room.id, p_version: v.room.version, p_number: v.number.trim(), p_name: v.name.trim() }),
      );
      return roomSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.room.project_id),
  });
}

interface RoomWallTarget {
  projectId: string;
  roomId: string;
  areaId: string;
}

/** A wall into a room, or out of it (`on` false); each is the other's Undo, and the wall keeps its line. */
export function useSetRoomWall() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: RoomWallTarget & { on: boolean }): Promise<void> => {
      if (isMock()) {
        await mockRooms.setWall(v.roomId, v.areaId, v.on);
        return;
      }
      const args = { p_room_id: v.roomId, p_area_id: v.areaId };
      if (v.on) throwIfErrorMaybe(await supabase.rpc('rev_room_wall_add', args));
      else throwIfErrorMaybe(await supabase.rpc('rev_room_wall_remove', args));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** A wall's line on its room's image (null takes it off), version-checked. Answers the new row (its version). */
export function useSetRoomWallLine() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { wall: RevRoomWall; line: WallLine | null }): Promise<RevRoomWall> => {
      if (isMock()) return mockRooms.setLine(v.wall, v.line);
      const data = throwIfError(
        await supabase.rpc('rev_room_wall_line', {
          p_room_id: v.wall.room_id,
          p_area_id: v.wall.area_id,
          p_version: v.wall.version,
          p_line: v.line,
        }),
      );
      return roomWallSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.wall.project_id),
  });
}

const linkedSchema = z.object({ linked: z.number().int(), missing: z.array(z.union([z.string(), z.number()])) });

export interface Linked {
  /** Room pictures newly linked. */
  images: number;
  /** Sign-offs newly linked to their OFS IR. */
  files: number;
  /** Walls newly given their plan sheet. */
  sheets: number;
}

/** Link files (revs.manage): each list's room pictures by name, the sign-offs' OFS IRs by number, the walls' sheets. */
export function useLinkRevFiles() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; listIds: readonly string[] }): Promise<Linked> => {
      if (isMock()) return mockFiles.linkFiles(v.projectId);
      let images = 0;
      for (const listId of v.listIds) {
        images += linkedSchema.parse(throwIfError(await supabase.rpc('rev_rooms_link_images', { p_list_id: listId }))).linked;
      }
      const files = linkedSchema.parse(throwIfError(await supabase.rpc('rev_signoffs_link_files', { p_project_id: v.projectId }))).linked;
      const sheets = linkedSchema.parse(throwIfError(await supabase.rpc('rev_walls_link_sheets', { p_project_id: v.projectId }))).linked;
      return { images, files, sheets };
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** Where a manager's pictures and OFS IRs go: the app's own folders, made on first use (0094 rev_files_folder). */
export type RevFolder = 'pictures' | 'history';

async function fetchFolder(projectId: string, which: RevFolder): Promise<string> {
  if (isMock()) return mockFiles.filesFolder(projectId, which);
  return z.string().parse(throwIfError(await supabase.rpc('rev_files_folder', { p_project_id: projectId, p_which: which })));
}

const folderKey = (projectId: string, which: RevFolder) => qk.revsPart(projectId, `folder:${which}`);

/** The folder's id, asked once a session (it never moves). */
export function revFolder(qc: QueryClient, projectId: string, which: RevFolder): Promise<string> {
  return qc.query({ queryKey: folderKey(projectId, which), queryFn: () => fetchFolder(projectId, which), staleTime: Infinity });
}

/** The folder's id once something was added to it this session (its upload lines show then), else null. */
export function useKnownRevFolder(projectId: string, which: RevFolder): string | null {
  const q = useQuery({ queryKey: folderKey(projectId, which), queryFn: () => fetchFolder(projectId, which), enabled: false, staleTime: Infinity });
  return q.data ?? null;
}

const fileLinkSchema = z.object({ rooms: z.number().int(), signoffs: z.number().int() });
export type FileLink = z.infer<typeof fileLinkSchema>;

/** One stored file linked at once by 0083's rules: how many rooms and sign-offs show it now (0 and 0: not matched). */
export async function linkRevFile(projectId: string, fileId: string): Promise<FileLink> {
  if (isMock()) return mockFiles.linkFile(projectId, fileId);
  return fileLinkSchema.parse(throwIfError(await supabase.rpc('rev_file_link', { p_file_id: fileId })));
}

async function setImage(room: RevRoom, fileId: string | null, imageName: string | null): Promise<RevRoom> {
  if (isMock()) return mockFiles.setImage(room, fileId, imageName);
  const data = throwIfError(
    await supabase.rpc('rev_room_image_set', { p_room_id: room.id, p_version: room.version, p_file_id: sqlNull(fileId), p_image_name: sqlNull(imageName) }),
  );
  return roomSchema.parse(one(data));
}

/** A room's picture from its page (revs.manage): stored in Room pictures, then the room's. Answers the room. */
export function useAddRoomPicture(projectId: string) {
  const user = useUser();
  const qc = useQueryClient();
  const refresh = useRefresh();
  const userId = user.id;
  const add = useCallback(
    async (v: { room: RevRoom; file: File }): Promise<RevRoom> => {
      const folderId = await revFolder(qc, projectId, 'pictures');
      const signal = new AbortController().signal;
      const { fileId } = await uploadFile({ file: v.file, projectId, folderId, userId, signal, onProgress: () => undefined });
      return setImage(v.room, fileId, null);
    },
    [qc, projectId, userId],
  );
  return useMutation({ mutationFn: add, onSettled: () => refresh(projectId) });
}

/** A room's picture set back (the Undo): the old file, or none with the old name. Version-checked. */
export function useSetRoomImage() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: { room: RevRoom; fileId: string | null; imageName: string | null }) => setImage(v.room, v.fileId, v.imageName),
    onSettled: (_r, _e, v) => refresh(v.room.project_id),
  });
}
