// The "little picker" on a wall's page (0083; Jesse, Oct 5: "a plan sheet with the wall highlighted on it as the little
// picker"): a small piece of the room's image around the wall, its line in the accent color. A tap opens the room's
// image over the whole window, zoomed on the wall (pinch, wheel or + / - / Fit), its other walls a tap away. A wall in
// two rooms (a shared wall) shows the first, or the one it was opened from, with a small switch; the room's name opens
// the room. A wall in no room shows nothing.
import { useState } from 'react';
import type { RevRoom, RevRooms } from '../../../data/revs.rooms';
import { useRevFile } from '../../../data/revs.history';
import type { RevArea, RevSetup, WallLine } from '../../../data/revs.types';
import type { StatusIndex } from '../model';
import { boxOf, cropAround } from '../plan/planGeom';
import { roomLabel, roomsOfWall, roomWalls } from '../rooms';
import { useWidth } from '../wall3d/useWidth';
import { RoomImage } from './RoomImage';
import { useImageAspect } from './useImageAspect';

interface WallRoomPickProps {
  projectId: string;
  area: RevArea;
  setup: RevSetup;
  index: StatusIndex;
  rooms: RevRooms;
  /** The room the wall was opened from (?room=), shown first. */
  fromRoom: string | undefined;
  isPhone: boolean;
  onOpenRoom: (roomId: string) => void;
  onOpenWall: (areaId: string, roomId: string) => void;
}

const height = (isPhone: boolean) => (isPhone ? 120 : 100);

function Crop({ url, line, w, h }: { url: string; line: WallLine | null; w: number; h: number }) {
  const size = useImageAspect(url);
  if (size.status !== 'ready' || w <= 0) {
    return <span className={`absolute inset-0 ${size.status === 'loading' ? 'animate-pulse bg-page' : 'bg-page'}`} />;
  }
  if (line === null) return <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />;
  const crop = cropAround(line, size.aspect, h / w);
  const imgW = w / crop.w;
  const at = (p: [number, number]) => `${String(((p[0] - crop.x) / crop.w) * w)},${String(((p[1] - crop.y) / crop.h) * h)}`;
  const pts = line.map(at).join(' ');
  return (
    <>
      <img
        src={url}
        alt=""
        draggable={false}
        className="absolute max-w-none"
        style={{ width: imgW, height: imgW * size.aspect, left: -crop.x * imgW, top: -crop.y * imgW * size.aspect }}
      />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${String(w)} ${String(h)}`} aria-hidden data-testid="rev-room-pick-line">
        <polyline points={pts} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={pts} fill="none" className="stroke-accent" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </>
  );
}

function Thumb({ projectId, room, line, isPhone, onOpen }: { projectId: string; room: RevRoom; line: WallLine | null; isPhone: boolean; onOpen: () => void }) {
  const [frame, width] = useWidth(isPhone ? 340 : 260);
  const file = useRevFile(projectId, room.image_file_id);
  return (
    <div ref={frame}>
      <button
        type="button"
        aria-label={`Show in ${roomLabel(room)}`}
        className="relative block w-full overflow-hidden rounded-lg border border-line bg-page shadow-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ height: height(isPhone) }}
        data-testid="rev-room-pick"
        onClick={onOpen}
      >
        {file.data ? (
          <Crop url={file.data.url} line={line} w={Math.round(width)} h={height(isPhone)} />
        ) : (
          <span className={`absolute inset-0 flex items-center justify-center text-[13px] text-ink-2 ${file.isPending ? 'animate-pulse' : ''}`}>
            {file.isError ? "Image didn't open." : null}
          </span>
        )}
      </button>
    </div>
  );
}

export function WallRoomPick({ projectId, area, setup, index, rooms, fromRoom, isPhone, onOpenRoom, onOpenWall }: WallRoomPickProps) {
  const its = roomsOfWall(rooms, area.id).filter((r) => r.room.image_file_id !== null);
  const [picked, setPicked] = useState<string | null>(fromRoom ?? null);
  const [full, setFull] = useState(false);
  const shown = its.find((r) => r.room.id === picked) ?? its[0];
  if (!shown) return null;
  const { room, line } = shown;
  const lines = roomWalls(setup, index, rooms, room.id).flatMap((w) =>
    w.link.line ? [{ id: w.area.id, line: w.link.line, color: w.color, title: w.title }] : [],
  );
  return (
    <div className={`flex flex-col gap-1 ${isPhone ? 'w-full' : 'w-[260px] shrink-0'}`} data-testid="rev-room-picker">
      {its.length > 1 ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Room">
          {its.map((r) => (
            <button
              key={r.room.id}
              type="button"
              aria-pressed={r.room.id === room.id}
              className={`h-7 rounded-full border px-2.5 text-[12px] font-medium ${r.room.id === room.id ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong bg-card text-ink-2 hover:bg-page'}`}
              data-testid={`rev-room-switch-${r.room.id}`}
              onClick={() => {
                setPicked(r.room.id);
              }}
            >
              {r.room.kind === 'room' ? r.room.number : r.room.name}
            </button>
          ))}
        </div>
      ) : null}
      <Thumb key={room.id} projectId={projectId} room={room} line={line} isPhone={isPhone} onOpen={() => { setFull(true); }} />
      <button type="button" className="self-start break-words text-left text-[13px] font-medium text-accent hover:underline" data-testid="rev-room-open" onClick={() => { onOpenRoom(room.id); }}>
        {roomLabel(room)}
      </button>
      {full ? (
        <RoomImage
          projectId={projectId}
          room={room}
          walls={lines}
          focusId={area.id}
          focus={line ? { ...boxOf([line]), fill: 0.6 } : null}
          onOpen={(id) => {
            setFull(false);
            if (id !== area.id) onOpenWall(id, room.id);
          }}
          full
          onFull={setFull}
          className="hidden"
        />
      ) : null}
    </div>
  );
}
