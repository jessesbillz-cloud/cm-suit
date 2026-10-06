// A room's own page (0083; Jesse, Oct 5: "you click on the room and it breaks it down into the walls"): its number,
// name and one bar of its walls' items, the room's image larger with each wall's line in its state's color (a tap on a
// line opens the wall; pinch, wheel or + / - to zoom; full screen), then its walls as tiles. A manager renames or
// removes the room (Undo), adds a wall of the list or takes one out (Undo), and draws a wall's line on the image (tap
// its points, Done). On a desktop it fills the main area; on a phone it is its own screen.
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, Pencil, PenLine, Trash2 } from 'lucide-react';
import { useCapability } from '../../../data/queries';
import { useRevSetup, useRevStatus } from '../../../data/revs.queries';
import { useRevRooms, type RevRoom, type RevRooms } from '../../../data/revs.rooms';
import type { RevSetup } from '../../../data/revs.types';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../../ui/States';
import { indexStatus, type StatusIndex } from '../model';
import { DrawBar } from '../plan/DrawBar';
import { isLine } from '../plan/planGeom';
import { roomCount, roomLabel, roomWalls } from '../rooms';
import { useRevsNav } from '../useRevsNav';
import { useSetupActions } from '../useSetupActions';
import { WallProgress } from '../WallProgress';
import { WallTile } from '../WallsView';
import { AddRoomWall, RoomForm } from './RoomForms';
import { RoomImage } from './RoomImage';
import { useRoomActions } from './useRoomActions';

interface RoomPageProps {
  projectId: string;
  roomId: string;
  isPhone: boolean;
}

interface BodyProps {
  projectId: string;
  room: RevRoom;
  setup: RevSetup;
  index: StatusIndex;
  rooms: RevRooms;
  canManage: boolean;
  isPhone: boolean;
}

/** The image on the page: most of a phone's width, on a desktop the window less the header and the bars. */
const FRAME = 'relative flex min-h-[260px] flex-col overflow-hidden rounded-lg border border-line bg-page';
const FRAME_SIZE = `${FRAME} h-[44dvh] sm:h-[calc(100dvh-360px)] sm:max-h-[640px]`;

const LINK = 'min-h-8 rounded-md px-2 text-[13px] font-medium text-accent hover:bg-accent-soft disabled:text-ink-3';

function RoomBody({ projectId, room, setup, index, rooms, canManage, isPhone }: BodyProps) {
  const nav = useRevsNav(projectId, canManage);
  const walls = useMemo(() => roomWalls(setup, index, rooms, room.id), [setup, index, rooms, room.id]);
  const count = roomCount(walls);
  const act = useRoomActions(projectId, room, walls);
  const setupActions = useSetupActions(projectId);
  const [full, setFull] = useState(false);
  const [editing, setEditing] = useState(false);
  const list = setup.lists.find((l) => l.id === room.list_id);
  const meta = [room.level.trim(), list?.name, list?.phase].filter((x): x is string => Boolean(x));
  const lines = walls.flatMap((w) => (w.link.line && w.area.id !== act.drawing?.area.id ? [{ id: w.area.id, line: w.link.line, color: w.color, title: w.title }] : []));
  const size = isPhone ? 'md' : 'sm';
  const drawBar: ReactNode = act.drawing ? (
    <DrawBar
      step="draw"
      points={act.points.length}
      ready={isLine(act.points)}
      placing={act.drawing.title}
      name=""
      onName={() => undefined}
      lists={[]}
      listId={null}
      onList={() => undefined}
      busy={act.busy}
      isPhone={isPhone}
      onUndo={act.undoPoint}
      onDone={act.done}
      onClose={act.close}
      onBack={act.close}
      onSave={act.done}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="rev-room-page" data-room={room.id}>
      <header className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-ink-2" data-testid="rev-room-level">
          {meta.join(' · ')}
        </span>
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 break-words text-[24px] font-semibold leading-8 tracking-[-0.015em] text-ink" data-testid="rev-room-name">
            {roomLabel(room)}
          </h1>
          {canManage ? (
            <span className="flex shrink-0 items-center">
              <Button size={size} variant="quiet" icon={Pencil} aria-label="Edit the room" title="Edit" data-testid="rev-room-edit" onClick={() => { setEditing(true); }} />
              <Button
                size={size}
                variant="quiet"
                icon={Trash2}
                aria-label="Remove the room"
                title="Remove"
                disabled={setupActions.busy}
                data-testid="rev-room-remove"
                onClick={() => {
                  void setupActions.remove('room', room, roomLabel(room)).then((gone) => {
                    if (gone) nav.close();
                  });
                }}
              />
            </span>
          ) : null}
        </div>
        <WallProgress count={count} withLine testId="rev-room-progress" />
      </header>
      {editing ? <RoomForm room={room} onSave={act.rename} onCancel={() => { setEditing(false); }} /> : null}
      {full ? null : drawBar}
      <RoomImage
        projectId={projectId}
        room={room}
        walls={lines}
        focusId={act.drawing?.area.id ?? null}
        onOpen={(id) => {
          setFull(false);
          nav.openFromRoom(id, room.id);
        }}
        draft={act.drawing ? act.points : null}
        onPoint={act.drawing ? act.tap : undefined}
        full={full}
        onFull={setFull}
        bar={drawBar}
        className={FRAME_SIZE}
      />
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 px-1 text-[12px] font-semibold uppercase leading-5 tracking-[0.06em] text-ink-2">Walls</h2>
          {canManage ? <AddRoomWall setup={setup} room={room} walls={walls} busy={act.busy} onAdd={act.add} /> : null}
        </div>
        {walls.length === 0 ? <EmptyState title="No walls in this room yet." /> : null}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {walls.map((w) => (
            <WallTile
              key={w.area.id}
              area={w.area}
              setup={setup}
              index={index}
              onOpen={(id) => {
                nav.openFromRoom(id, room.id);
              }}
              footer={
                canManage ? (
                  <span className="flex justify-end gap-1">
                    <button type="button" className={LINK} disabled={act.busy || room.image_file_id === null} data-testid={`rev-room-draw-${w.area.id}`} onClick={() => { act.draw(w.area.id); }}>
                      <Icon icon={PenLine} size={14} className="mr-1 inline" />
                      {w.link.line ? 'Redraw' : 'Draw'}
                    </button>
                    <button type="button" className={LINK} disabled={act.busy} data-testid={`rev-room-out-${w.area.id}`} onClick={() => { act.takeOut(w.area); }}>
                      Take out
                    </button>
                  </span>
                ) : null
              }
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function BackToRevs({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const nav = useRevsNav(projectId, canManage);
  return (
    <button type="button" className="-ml-1 flex h-8 items-center gap-0.5 self-start text-sm font-medium text-accent" data-testid="rev-room-back" onClick={nav.close}>
      <Icon icon={ChevronLeft} size={16} />
      Revs
    </button>
  );
}

export function RoomPage({ projectId, roomId, isPhone }: RoomPageProps) {
  const setup = useRevSetup(projectId);
  const status = useRevStatus(projectId);
  const rooms = useRevRooms(projectId);
  const manage = useCapability(projectId, 'revs.manage');
  const index = useMemo(() => indexStatus(status.data ?? []), [status.data]);

  let body: ReactNode;
  const failed = [setup, status, rooms, manage].find((q) => q.isError);
  const room = rooms.data?.rooms.find((r) => r.id === roomId);
  if (failed) body = <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  else if (!setup.data || !status.data || !rooms.data || manage.isPending) body = <LoadingState label="Loading the room" />;
  else if (!room) body = <EmptyState title="This room is no longer on the job." />;
  else {
    body = (
      <RoomBody
        key={room.id}
        projectId={projectId}
        room={room}
        setup={setup.data}
        index={index}
        rooms={rooms.data}
        canManage={manage.data === true}
        isPhone={isPhone}
      />
    );
  }
  // A phone's screen has its own Back.
  if (isPhone) return <div className="px-4 pt-3">{body}</div>;
  return (
    <div className="flex flex-col gap-2">
      <BackToRevs projectId={projectId} canManage={manage.data === true} />
      <Card>{body}</Card>
    </div>
  );
}
