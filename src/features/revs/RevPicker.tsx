// What an OFS request inspects on a job with revs, laid out like My Daily Reports' Special kinds: buttons that just say
// what each one is. The walls by level; once walls are picked, up to three items of their list, each picked one with
// the color it gets on the map; then the title the map will carry. Props only (the job's setup and status in, the pick
// out), so the no-login request page uses it too. The database decides again on submit (ir_submit_ofs).
import { useMemo } from 'react';
import { MapIcon } from 'lucide-react';
import type { RevSetup, RevStatusRow } from '../../data/revs.types';
import { Icon } from '../../ui/Icon';
import { Segments } from '../../ui/Segments';
import {
  itemsByRev, listsWithWalls, mapWhat, pickList, pickWalls, requestPlan, statusIndex, titlePreview, toggleItem,
  wallsByLevel, type RevPick,
} from './revPick';
import { RevItems } from './RevItems';
import { RevWalls } from './RevWalls';

interface RevPickerProps {
  setup: RevSetup;
  status: readonly RevStatusRow[];
  value: RevPick;
  onChange: (next: RevPick) => void;
  /** yyyy-MM-dd: the request's day, for the map title. */
  date: string;
}

export function RevPicker({ setup, status, value, onChange, date }: RevPickerProps) {
  const index = useMemo(() => statusIndex(status), [status]);
  const lists = listsWithWalls(setup);
  const list = setup.lists.find((l) => l.id === value.listId) ?? null;
  const { items, walls } = requestPlan(setup, index, value);
  const colors = new Map(items.map((r) => [r.item.id, r.color]));

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
      <RevWalls
        groups={wallsByLevel(setup, value.listId)}
        picked={value.areaIds}
        onChange={(areaIds) => {
          onChange(pickWalls(setup, index, value, areaIds));
        }}
      />
      {value.areaIds.length > 0 ? (
        <div className="border-t border-line pt-4">
          <RevItems
            groups={itemsByRev(setup, value.listId)}
            index={index}
            pick={value}
            colors={colors}
            onToggle={(id) => {
              onChange(toggleItem(value, id));
            }}
          />
        </div>
      ) : null}
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
