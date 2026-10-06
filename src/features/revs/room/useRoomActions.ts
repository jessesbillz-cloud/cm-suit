// A manager's moves on a room's page (0083), each one save with Undo in the toast instead of "are you sure?": rename
// the room (Undo puts the old number and name back), take a wall out of it or add one (each the other's Undo, the
// wall keeps its line), and draw a wall's line on the room's image (tap its points, Done; Undo puts the old line back).
// Taps land on a corner already drawn when close, and square up when nearly level or plumb (planGeom placePoint).
// Removing the room is Setup's remove (useSetupActions, kind 'room'). Undo uses mutateAsync, which settles even if
// the screen has moved on.
import { useState } from 'react';
import { messageOf } from '../../../data/errors';
import { useSaveRoom, useSetRoomWall, useSetRoomWallLine, type RevRoom } from '../../../data/revs.rooms';
import type { RevArea } from '../../../data/revs.types';
import { useToast } from '../../../ui/Toast';
import { cornersOf, isLine, placePoint, type Pt } from '../plan/planGeom';
import { calloutOf } from '../wallPage';
import type { RoomWall } from '../rooms';

/** A tap this close to a corner already drawn (screen pixels) lands on it. */
const SNAP_PX = 14;
/** The most points a wall's line on a room's image has. */
const MAX_POINTS = 8;

export function useRoomActions(projectId: string, room: RevRoom, walls: readonly RoomWall[]) {
  const toast = useToast();
  const saveRoom = useSaveRoom();
  const setWall = useSetRoomWall();
  const setLine = useSetRoomWallLine();
  const [drawing, setDrawing] = useState<string | null>(null);
  const [points, setPoints] = useState<Pt[]>([]);
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  const undoable = (message: string, undo: () => Promise<unknown>) => {
    toast.show({ message, action: { label: 'Undo', onClick: () => { void undo().catch(failed); } } });
  };
  const target = walls.find((w) => w.area.id === drawing) ?? null;
  const corners = cornersOf(walls.filter((w) => w.area.id !== drawing).flatMap((w) => (w.link.line ? [w.link.line] : [])));

  const wallMove = (area: RevArea, on: boolean) => {
    const v = { projectId, roomId: room.id, areaId: area.id };
    const name = calloutOf(area.name).title;
    setWall.mutate(
      { ...v, on },
      {
        onSuccess: () => {
          undoable(on ? `${name} added.` : `${name} taken out.`, () => setWall.mutateAsync({ ...v, on: !on }));
        },
        onError: failed,
      },
    );
  };

  return {
    busy: saveRoom.isPending || setWall.isPending || setLine.isPending,
    /** Saves; true when saved (the form closes). */
    rename: async (number: string, name: string): Promise<boolean> => {
      try {
        const row = await saveRoom.mutateAsync({ room, number, name });
        undoable('Room saved.', () => saveRoom.mutateAsync({ room: row, number: room.number, name: room.name }));
        return true;
      } catch (e) {
        failed(e);
        return false;
      }
    },
    add: (area: RevArea) => {
      wallMove(area, true);
    },
    takeOut: (area: RevArea) => {
      wallMove(area, false);
    },
    /** The wall whose line is being drawn, and its points so far. */
    drawing: target,
    points,
    draw: (areaId: string) => {
      setPoints([]);
      setDrawing(areaId);
    },
    close: () => {
      setPoints([]);
      setDrawing(null);
    },
    /** A tap while drawing (one off the image lands on its edge, planGeom placePoint). */
    tap: (p: Pt, scale: number, aspect: number) => {
      setPoints((line) => (line.length >= MAX_POINTS ? line : [...line, placePoint(p, line, corners, SNAP_PX / Math.max(scale, 1), aspect)]));
    },
    undoPoint: () => {
      setPoints((line) => line.slice(0, -1));
    },
    done: () => {
      if (!target || !isLine(points)) return;
      const was = target.link;
      setLine.mutate(
        { wall: was, line: points },
        {
          onSuccess: (row) => {
            setPoints([]);
            setDrawing(null);
            undoable(`${target.title} drawn.`, () => setLine.mutateAsync({ wall: row, line: was.line }));
          },
          onError: failed,
        },
      );
    },
  };
}
