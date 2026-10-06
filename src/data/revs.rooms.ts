// Rooms (migration 0083; Jesse, Oct 5: "Room and then you click on the room and it breaks it down into the walls"). A
// list's rooms on each level (a room, the level's exterior walls, or a shaft), each with its cropped plan image and its
// walls, each wall with its line on that image (none until drawn). A wall may be in several rooms. Reads: the tables
// (RLS: revs.read). Writes (revs.manage): a room's number and name (version-checked), a wall in or out of a room (each
// the other's Undo, the line kept), a wall's line (Undo sends the old one back), and Link files: the rooms' images and
// the sign-offs' OFS IRs linked by name after they are dragged into Files. The rooms themselves are loaded in one call
// (rev_rooms_load), not from a screen. Every write refreshes the job's revs.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockRooms from './mock/revRooms';
import { wallLineSchema, type WallLine } from './revs.types';

const REV_ROOM_COLS = 'id, project_id, list_id, level, number, name, kind, image_file_id, position, version, deleted_at';
const REV_ROOM_WALL_COLS = 'id, project_id, room_id, area_id, line, position, version, deleted_at';

const roomSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  list_id: z.string(),
  level: z.string(),
  number: z.string(),
  name: z.string(),
  kind: z.enum(['room', 'exterior', 'shaft']),
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
  /** Room images newly linked. */
  images: number;
  /** Sign-offs newly linked to their OFS IR. */
  files: number;
}

/** Link files (revs.manage): each list's room images by name, then the sign-offs' OFS IRs by number. */
export function useLinkRevFiles() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; listIds: readonly string[] }): Promise<Linked> => {
      if (isMock()) return mockRooms.linkFiles(v.projectId);
      let images = 0;
      for (const listId of v.listIds) {
        images += linkedSchema.parse(throwIfError(await supabase.rpc('rev_rooms_link_images', { p_list_id: listId }))).linked;
      }
      const files = linkedSchema.parse(throwIfError(await supabase.rpc('rev_signoffs_link_files', { p_project_id: v.projectId }))).linked;
      return { images, files };
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}
