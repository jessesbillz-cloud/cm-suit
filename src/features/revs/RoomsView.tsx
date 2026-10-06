// Rooms (0083; Jesse, Oct 5: "start with the electrical room and then let it break down into each of the four walls
// ... a cropped plan image of the room. It doesn't have to be very big"): per level, a tile per room with its small
// image, its number and name, and one bar of its walls' items (passed, requested, failed), then the level's exterior
// walls and its shafts. A tap opens the room's page. Walls in no room stay under "Other walls", so nothing is lost. A
// job with no rooms shows its walls as the list does.
import type { RevRoom, RevRooms } from '../../data/revs.rooms';
import { useRevFile } from '../../data/revs.history';
import type { RevSetup } from '../../data/revs.types';
import type { StatusIndex } from './model';
import { roomCount, roomsByList, roomWalls } from './rooms';
import { countLine } from './wallPage';
import { WallProgress } from './WallProgress';
import { countOfThings, LevelHead, NoWalls, WallTile, WallsView } from './WallsView';

interface RoomsViewProps {
  projectId: string;
  setup: RevSetup;
  index: StatusIndex;
  rooms: RevRooms;
  onOpenRoom: (roomId: string) => void;
  onOpenWall: (areaId: string) => void;
  onSetup?: (() => void) | undefined;
}

const KIND_WORD: Record<RevRoom['kind'], string | null> = { room: null, exterior: 'Exterior', shaft: 'Shaft' };

function Thumb({ projectId, fileId }: { projectId: string; fileId: string }) {
  const file = useRevFile(projectId, fileId);
  return (
    <span className="relative block h-16 w-20 shrink-0 overflow-hidden rounded-md border border-line bg-page" data-testid="rev-room-thumb">
      {file.data ? <img src={file.data.url} alt="" draggable={false} className="h-full w-full object-cover" /> : null}
      {file.isPending ? <span aria-hidden className="absolute inset-0 animate-pulse bg-line/50" /> : null}
    </span>
  );
}

interface RoomTileProps {
  projectId: string;
  room: RevRoom;
  setup: RevSetup;
  index: StatusIndex;
  rooms: RevRooms;
  onOpen: (roomId: string) => void;
}

function RoomTile({ projectId, room, setup, index, rooms, onOpen }: RoomTileProps) {
  const walls = roomWalls(setup, index, rooms, room.id);
  const count = roomCount(walls);
  const done = count.needed > 0 && count.passed === count.needed;
  const small = room.kind === 'room' ? room.number : KIND_WORD[room.kind];
  return (
    <li>
      <button
        type="button"
        data-testid={`rev-room-${room.id}`}
        data-kind={room.kind}
        data-failed={count.failed > 0 ? 'true' : undefined}
        className="flex h-full w-full flex-col gap-2.5 rounded-card bg-card px-4 pb-3.5 pt-3 text-left shadow-card transition-shadow hover:shadow-pop focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={() => {
          onOpen(room.id);
        }}
      >
        <span className="flex items-start gap-3">
          {room.image_file_id !== null ? <Thumb projectId={projectId} fileId={room.image_file_id} /> : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {small !== null ? <span className="text-[12.5px] font-semibold leading-4 text-ink-3">{small}</span> : null}
            <span className="break-words text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">{room.name}</span>
            <span className="text-[13px] font-medium text-ink-2">{countOfThings(walls.length, 'wall', 'walls')}</span>
          </span>
        </span>
        <span className="mt-auto flex flex-col gap-1">
          <WallProgress count={count} />
          <span className={`text-[12.5px] font-medium tabular-nums ${done ? 'text-[color:var(--status-approved-fg)]' : 'text-ink-3'}`}>
            {countLine(count)}
            {count.failed > 0 ? <span className="text-danger">{` · ${String(count.failed)} failed`}</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3';

export function RoomsView({ projectId, setup, index, rooms, onOpenRoom, onOpenWall, onSetup }: RoomsViewProps) {
  if (rooms.rooms.length === 0) return <WallsView setup={setup} index={index} onOpen={onOpenWall} onSetup={onSetup} />;
  const groups = roomsByList(setup, rooms);
  if (groups.length === 0) return <NoWalls onSetup={onSetup} />;
  const manyLists = setup.lists.length > 1;
  return (
    <div className="flex flex-col gap-5" data-testid="rev-rooms">
      {groups.map(({ list, levels }) => (
        <section key={list.id} className="flex flex-col gap-4">
          {manyLists ? (
            <p className="break-words px-1 text-[15px] font-semibold text-ink">
              {list.name}
              {list.phase ? <span className="ml-2 text-[13px] font-medium text-ink-3">{list.phase}</span> : null}
            </p>
          ) : null}
          {levels.map((g) => (
            <section key={g.level} className="flex flex-col gap-2" data-testid="rev-room-level">
              <LevelHead title={g.level} count={countOfThings(g.rooms.length, 'room', 'rooms')} />
              {g.rooms.length > 0 ? (
                <ul className={GRID}>
                  {g.rooms.map((r) => (
                    <RoomTile key={r.id} projectId={projectId} room={r} setup={setup} index={index} rooms={rooms} onOpen={onOpenRoom} />
                  ))}
                </ul>
              ) : null}
              {g.others.length > 0 ? (
                <>
                  <p className="mt-1 px-1 text-[12.5px] font-semibold text-ink-3" data-testid="rev-other-walls">
                    Other walls
                  </p>
                  <ul className={GRID}>
                    {g.others.map((a) => (
                      <WallTile key={a.id} area={a} setup={setup} index={index} onOpen={onOpenWall} />
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ))}
        </section>
      ))}
    </div>
  );
}
