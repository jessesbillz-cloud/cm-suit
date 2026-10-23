// A room's own page (0083; Jesse, Oct 5: "you click on the room and it breaks it down into the walls"; Oct 6: "rooms
// then walls with the revs"): its number, name and one bar of its walls' items, the room's picture (compact) with each
// wall's line in its state's color and its bubble ("North wall"; a tap on a line or bubble opens the wall; pinch, wheel
// or + / - to zoom; full screen), then its walls as rows, each led by the same bubble (Jesse, Oct 12: "those bubbles
// that you can follow") and one bubble per rev (Oct 11). No picture: nothing for readers, a slim place for a manager's (RoomImage).
// A manager renames or removes the room (Undo), adds a wall of its level or takes one out (Undo), and draws a wall's
// line on the picture (tap its points, Done). On a desktop it fills the main area; on a phone it is its own screen.
// Request inspection (those who may ask, ir.request; Jesse, Oct 10: "do it for the whole room very easily") opens a new
// OFS request with every wall of the room picked, the items to pick first. Set up card (a manager; 0101, Jesse Oct 12)
// opens the room's card on its own screen (CardSetup, ?view=card): the walls tracked here and the items they need.
import { useMemo, useState, type ReactNode } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ChevronLeft, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCapability } from '../../../data/queries';
import { useSignoffFiles } from '../../../data/revs.history';
import { useRevSetup, useRevStatus } from '../../../data/revs.queries';
import { useRevRooms, type RevRoom, type RevRooms } from '../../../data/revs.rooms';
import type { RevArea, RevSetup } from '../../../data/revs.types';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../../ui/States';
import { indexStatus, wallRevs, type StatusIndex } from '../model';
import { indexSignoffFiles, type SignoffFiles } from '../revStrip';
import { DrawBar } from '../plan/DrawBar';
import { isLine } from '../plan/planGeom';
import { roomCount, roomLabel, roomWalls } from '../rooms';
import { useRevsNav } from '../useRevsNav';
import { useSetupActions } from '../useSetupActions';
import { useOpenRevFile } from '../useOpenRevFile';
import { WallProgress } from '../WallProgress';
import { CardSetup } from './CardSetup';
import { AddRoomWall, RoomForm } from './RoomForms';
import { RoomImage } from './RoomImage';
import { RoomWallRow } from './RoomWallRow';
import { useRoomActions } from './useRoomActions';
import { RoomPhotos } from '../photos/RoomPhotos';
import { SECTION_HEAD } from '../../../ui/PageHeader';

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
  files: SignoffFiles;
  canManage: boolean;
  /** May ask for inspections (ir.request). */
  canRequest: boolean;
  isPhone: boolean;
}

/** The picture on the page: compact, the walls under it in view; with none, a slim place for a manager's. */
const FRAME = 'relative flex flex-col overflow-hidden rounded-lg border border-line bg-page';
const FRAME_SIZE = `${FRAME} h-[32dvh] min-h-[200px] sm:h-[320px]`;
// Full screen of nothing is no use: the slim place has none.
const FRAME_NONE = `${FRAME} h-16 [&_div:has(>[data-testid=sheet-full])]:hidden`;

function RoomBody({ projectId, room, setup, index, rooms, files, canManage, canRequest, isPhone }: BodyProps) {
  const nav = useRevsNav(projectId, canManage);
  const walls = useMemo(() => roomWalls(setup, index, rooms, room.id), [setup, index, rooms, room.id]);
  const count = roomCount(walls);
  const act = useRoomActions(projectId, room, walls);
  const setupActions = useSetupActions(projectId);
  const openFile = useOpenRevFile(projectId);
  const hasPicture = room.image_file_id !== null;
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
          <h1 className="heading min-w-0 flex-1 break-words text-[28px] font-semibold leading-9 text-ink" data-testid="rev-room-name">
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
                    if (gone) nav.close(room.level.trim());
                  });
                }}
              />
            </span>
          ) : null}
        </div>
        <WallProgress count={count} withLine testId="rev-room-progress" />
        <div className={`flex flex-wrap gap-2 ${isPhone ? 'flex-col' : ''}`}>
          {canRequest && count.needed > count.passed + count.requested ? (
            <Button
              variant="primary"
              icon={Plus}
              size={isPhone ? 'lg' : 'md'}
              data-testid="rev-room-request"
              onClick={() => {
                nav.request(walls.map((w) => w.area.id), []);
              }}
            >
              Request inspection
            </Button>
          ) : null}
          {canManage ? (
            <Button icon={ListChecks} size={isPhone ? 'lg' : 'md'} data-testid="rev-room-card" onClick={() => { nav.openCard(room.id); }}>
              Set up card
            </Button>
          ) : null}
        </div>
      </header>
      {editing ? <RoomForm room={room} onSave={act.rename} onCancel={() => { setEditing(false); }} /> : null}
      {full ? null : drawBar}
      {hasPicture || canManage ? (
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
          className={hasPicture ? FRAME_SIZE : FRAME_NONE}
        />
      ) : null}
      <section className="flex flex-col gap-1">
        <div className={`flex flex-wrap items-center gap-2 ${SECTION_HEAD}`}>
          <h2 className="flex-1">Walls</h2>
          {canManage ? <AddRoomWall setup={setup} room={room} walls={walls} busy={act.busy} onAdd={act.add} /> : null}
        </div>
        {walls.length === 0 ? <EmptyState title="No walls in this room yet." /> : null}
        <ul className="flex flex-col divide-y divide-line" data-testid="rev-room-walls">
          {walls.map((w) => (
            <RoomWallRow
              key={w.area.id}
              wall={w}
              setup={setup}
              index={index}
              files={files}
              isPhone={isPhone}
              manage={
                canManage
                  ? { canDraw: hasPicture, busy: act.busy, onDraw: () => { act.draw(w.area.id); }, onTakeOut: () => { act.takeOut(w.area); } }
                  : null
              }
              onOpen={() => {
                nav.openFromRoom(w.area.id, room.id);
              }}
              onChip={(chip) => {
                if (chip.fileId !== null) openFile(chip.fileId);
                else nav.openFromRoom(w.area.id, room.id, firstItemOf(setup, index, w.area, chip.rev.id));
              }}
            />
          ))}
        </ul>
      </section>
      <RoomPhotos projectId={projectId} roomId={room.id} walls={walls} isPhone={isPhone} />
    </div>
  );
}

/** The rev's first item the wall needs (Setup's order): where a tap on its bubble opens the wall. */
function firstItemOf(setup: RevSetup, index: StatusIndex, area: RevArea, revId: string): string | undefined {
  return wallRevs(setup, index, area).find((r) => r.rev.id === revId)?.cells[0]?.item.id;
}

function BackToRevs({ projectId, canManage, level }: { projectId: string; canManage: boolean; level: string | undefined }) {
  const nav = useRevsNav(projectId, canManage);
  return (
    <button
      type="button"
      className="-ml-1 flex h-8 items-center gap-0.5 self-start text-sm font-medium text-accent"
      data-testid="rev-room-back"
      onClick={() => {
        nav.close(level);
      }}
    >
      <Icon icon={ChevronLeft} size={16} />
      Inspection cards
    </button>
  );
}

export function RoomPage({ projectId, roomId, isPhone }: RoomPageProps) {
  const own: { view?: string | undefined } = useSearch({ strict: false });
  const setup = useRevSetup(projectId);
  const status = useRevStatus(projectId);
  const rooms = useRevRooms(projectId);
  const manage = useCapability(projectId, 'revs.manage');
  const ask = useCapability(projectId, 'ir.request');
  const signoffs = useSignoffFiles(projectId);
  const nav = useRevsNav(projectId, manage.data === true);
  const index = useMemo(() => indexStatus(status.data ?? []), [status.data]);
  const files = useMemo(() => indexSignoffFiles(signoffs.data ?? []), [signoffs.data]);

  let body: ReactNode;
  const failed = [setup, status, rooms, manage, ask, signoffs].find((q) => q.isError);
  const room = rooms.data?.rooms.find((r) => r.id === roomId);
  if (failed) body = <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  else if (!setup.data || !status.data || !rooms.data || manage.isPending || ask.isPending) body = <LoadingState label="Loading the room" />;
  else if (!room) body = <EmptyState title="This room is no longer on the job." />;
  else if (own.view === 'card' && manage.data === true) {
    body = <CardSetup key={room.id} room={room} setup={setup.data} index={index} rooms={rooms.data} isPhone={isPhone} onDone={() => { nav.openRoom(room.id, true); }} />;
  } else {
    body = (
      <RoomBody
        key={room.id}
        projectId={projectId}
        room={room}
        setup={setup.data}
        index={index}
        rooms={rooms.data}
        files={files}
        canManage={manage.data === true}
        canRequest={ask.data === true}
        isPhone={isPhone}
      />
    );
  }
  // A phone's screen has its own Back.
  if (isPhone) return <div className="px-4 pt-3">{body}</div>;
  return (
    <div className="flex flex-col gap-2">
      <BackToRevs projectId={projectId} canManage={manage.data === true} level={room?.level.trim()} />
      <Card>{body}</Card>
    </div>
  );
}
