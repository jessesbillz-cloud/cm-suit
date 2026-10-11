// What an OFS request inspects on a job with revs, laid out like My Daily Reports' Special kinds: buttons that just say
// what each one is. Items first (Jesse, Oct 10: "that should be the first thing that comes up"): up to three items of
// the list, each picked one with the color it gets on the map, the limit said once in the heading; then the walls by
// level, room first when the job's rooms are given (RevRoomPick; Jesse, Oct 10: "selecting the whole room should be the
// first option"), else one button per wall. A request that came with walls (a room's, a wall's) shows those, all on, a
// tap takes one off, and Add walls shows the rest of the list. Then the title the map will carry. Props only (the job's
// setup, status and rooms in, the pick out), so the no-login request page uses it too (no rooms there: wall buttons).
// The database decides again on submit (ir_submit_ofs).
import { useMemo, useState } from 'react';
import { MapIcon, Plus } from 'lucide-react';
import type { RevRooms } from '../../data/revs.rooms';
import type { RevSetup, RevStatusRow } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { FIELD_MISSING } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { Segments } from '../../ui/Segments';
import {
  MAX_ITEMS, itemsByRev, listsWithWalls, mapWhat, pickList, pickWalls, requestPlan, statusIndex, titlePreview, toggleItem,
  wallsByLevel, type RevPick,
} from './revPick';
import { RevItems } from './RevItems';
import { RevRoomPick } from './RevRoomPick';
import { RevWalls } from './RevWalls';
import { hasRooms, nearGroups, roomGroups, shownCount } from './roomPick';

interface RevPickerProps {
  setup: RevSetup;
  status: readonly RevStatusRow[];
  value: RevPick;
  onChange: (next: RevPick) => void;
  /** yyyy-MM-dd: the request's day, for the map title. */
  date: string;
  /** The walls the request came with (a room's, a wall's): shown on their own until Add walls. */
  near?: readonly string[] | undefined;
  /** The job's rooms: walls are picked room first. None: one button per wall. */
  rooms?: RevRooms | null | undefined;
  /** The section a tap on Request jumped to (still missing): ringed. */
  flag?: 'what' | 'walls' | null | undefined;
}

const HEAD = 'flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1';
const TITLE = 'text-sm font-semibold text-ink';

export function RevPicker({ setup, status, value, onChange, date, near = [], rooms = null, flag = null }: RevPickerProps) {
  const index = useMemo(() => statusIndex(status), [status]);
  const [more, setMore] = useState(false);
  const lists = listsWithWalls(setup);
  const list = setup.lists.find((l) => l.id === value.listId) ?? null;
  const { items, walls } = requestPlan(setup, index, value);
  const colors = new Map(items.map((r) => [r.item.id, r.color]));
  const allWalls = wallsByLevel(setup, value.listId);
  const nearSet = new Set(near);
  const onlyNear = near.length > 0 && !more;
  const groups = onlyNear
    ? allWalls.map((g) => ({ ...g, areas: g.areas.filter((a) => nearSet.has(a.id)) })).filter((g) => g.areas.length > 0)
    : allWalls;
  const allRooms = rooms ? roomGroups(setup, rooms, value.listId) : [];
  const byRoom = hasRooms(allRooms);
  const roomView = onlyNear ? nearGroups(allRooms, near) : allRooms;
  const hidden = byRoom
    ? shownCount(roomView) < shownCount(allRooms)
    : onlyNear && allWalls.some((g) => g.areas.some((a) => !nearSet.has(a.id)));
  const pickWallIds = (areaIds: string[]) => {
    onChange(pickWalls(setup, index, value, areaIds));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="rev-picker">
      {lists.length > 1 ? (
        <Segments
          label="List"
          kind="radio"
          testId="rev-list"
          options={lists.map((l) => ({ value: l.id, label: l.name }))}
          value={value.listId ?? ''}
          onPick={(id) => {
            if (id !== value.listId) onChange(pickList(id));
          }}
        />
      ) : null}
      <section className={`flex flex-col gap-3 ${flag === 'what' ? FIELD_MISSING : ''}`} aria-label="What to inspect" data-missing="what">
        <div className={HEAD}>
          <h3 className={TITLE}>What to inspect</h3>
          <span className="text-[13px] text-ink-2" data-testid="rev-items-max">
            Pick up to {MAX_ITEMS}
          </span>
        </div>
        <RevItems
          groups={itemsByRev(setup, value.listId)}
          index={index}
          pick={value}
          colors={colors}
          onToggle={(id) => {
            onChange(toggleItem(value, id));
          }}
        />
      </section>
      <section className={`flex flex-col gap-3 border-t border-line pt-4 ${flag === 'walls' ? FIELD_MISSING : ''}`} aria-label={byRoom ? 'Rooms' : 'Walls'} data-missing="walls">
        <div className={HEAD}>
          <h3 className={TITLE}>{byRoom ? 'Rooms' : 'Walls'}</h3>
          {hidden ? (
            <Button
              size="sm"
              variant="quiet"
              icon={Plus}
              data-testid="rev-walls-more"
              onClick={() => {
                setMore(true);
              }}
            >
              Add walls
            </Button>
          ) : null}
        </div>
        {byRoom ? (
          <RevRoomPick groups={roomView} picked={value.areaIds} onChange={pickWallIds} />
        ) : (
          <RevWalls groups={groups} picked={value.areaIds} onChange={pickWallIds} />
        )}
      </section>
      {items.length > 0 && walls.length > 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-page px-3 py-2 text-[13px] font-semibold leading-5 text-ink">
          <Icon icon={MapIcon} size={16} label="Map title" className="mt-0.5 shrink-0 text-ink-2" />
          <span className="min-w-0 break-words" data-testid="rev-title">
            {titlePreview(list?.phase ?? null, date, mapWhat(walls, items))}
          </span>
        </p>
      ) : null}
    </div>
  );
}
