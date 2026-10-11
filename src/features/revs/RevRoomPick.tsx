// The request picker's walls, room first (Jesse, Oct 10: "the entire room first, and then if you wanted it, you expand
// it to just one wall and select from there"): per level, one button per room that picks all its walls ("0134 Main
// Electrical · 4 walls"; "1 of 4 walls" while only some are picked) with Walls beside it to show that room's walls as
// buttons, one taken off or picked alone; then the level's walls in no room. Names wrap, never cut.
import { useState } from 'react';
import { ChipPick } from '../../ui/ChipPick';
import { pickedIn, roomCountLabel, tapRoom, type PickRoom, type RoomGroup } from './roomPick';
import { GROUP_LABEL } from './RevWalls';

interface RevRoomPickProps {
  groups: readonly RoomGroup[];
  picked: readonly string[];
  /** Every picked wall after a tap. */
  onChange: (areaIds: string[]) => void;
}

const ROOM = 'flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-1.5 rounded-lg border px-3 py-1.5 text-left text-sm font-medium wrap-anywhere';
const ROOM_STATE = {
  all: 'border-accent bg-accent text-white',
  some: 'border-accent bg-card text-accent',
  none: 'border-line bg-card text-ink hover:border-line-strong',
} as const;
const TOGGLE = 'min-h-11 shrink-0 rounded-lg border px-3 text-[13px] font-medium';

interface RoomRowProps {
  room: PickRoom;
  picked: readonly string[];
  open: boolean;
  onOpen: () => void;
  onChange: (areaIds: string[]) => void;
}

function RoomRow({ room, picked, open, onOpen, onChange }: RoomRowProps) {
  const on = pickedIn(room, picked);
  const state = on === 0 ? 'none' : on === room.walls.length ? 'all' : 'some';
  const here = new Set(room.walls.map((a) => a.id));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          aria-pressed={state === 'all' ? true : state === 'some' ? 'mixed' : false}
          data-testid={`rev-pick-room-${room.id}`}
          className={`${ROOM} ${ROOM_STATE[state]}`}
          onClick={() => {
            onChange(tapRoom(picked, room));
          }}
        >
          <span>{room.label}</span>
          <span className={state === 'all' ? 'text-white/85' : 'text-ink-2'}>· {roomCountLabel(room, picked)}</span>
        </button>
        <button
          type="button"
          aria-expanded={open}
          data-testid={`rev-pick-room-${room.id}-walls`}
          className={`${TOGGLE} ${open ? 'border-line-strong bg-page text-ink' : 'border-line bg-card text-ink-2 hover:border-line-strong'}`}
          onClick={onOpen}
        >
          Walls
        </button>
      </div>
      {open ? (
        <ChipPick
          label={room.label}
          multiple
          chips={room.walls.map((a) => ({ value: a.id, label: a.name }))}
          picked={picked.filter((id) => here.has(id))}
          onChange={(next) => {
            onChange([...picked.filter((id) => !here.has(id)), ...next]);
          }}
          testId="rev-wall"
        />
      ) : null}
    </div>
  );
}

export function RevRoomPick({ groups, picked, onChange }: RevRoomPickProps) {
  const [open, setOpen] = useState<readonly string[]>([]);
  return (
    <div className="flex flex-col gap-3" data-testid="rev-rooms-pick">
      {groups.map((g) => {
        const others = new Set(g.others.map((a) => a.id));
        return (
          <div key={g.level} className="flex flex-col gap-1.5">
            <span aria-hidden className={GROUP_LABEL}>
              {g.level}
            </span>
            {g.rooms.map((r) => (
              <RoomRow
                key={r.id}
                room={r}
                picked={picked}
                open={open.includes(r.id)}
                onOpen={() => {
                  setOpen((o) => (o.includes(r.id) ? o.filter((id) => id !== r.id) : [...o, r.id]));
                }}
                onChange={onChange}
              />
            ))}
            {g.others.length > 0 ? (
              <>
                <span className="pt-1 text-[13px] font-medium text-ink-2">Other walls</span>
                <ChipPick
                  label={`${g.level} other walls`}
                  multiple
                  chips={g.others.map((a) => ({ value: a.id, label: a.name }))}
                  picked={picked.filter((id) => others.has(id))}
                  onChange={(next) => {
                    onChange([...picked.filter((id) => !others.has(id)), ...next]);
                  }}
                  testId="rev-wall"
                />
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
