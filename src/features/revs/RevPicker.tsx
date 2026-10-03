// What an OFS request inspects on a job with revs: walls (by level, any number) and up to three items of their list, each
// item with the color it gets on the map, then the title the map will carry. Props only (the job's setup and status in,
// the pick out), so the no-login request page can use it too. The database decides again on submit (ir_submit_ofs).
import { useMemo } from 'react';
import type { RevSetup, RevStatusRow } from '../../data/revs.types';
import { FIELD_LABEL } from '../../ui/Fields';
import { Segments } from '../../ui/Segments';
import {
  itemsByRev, listsWithWalls, mapWhat, pickList, requestPlan, statusIndex, titlePreview, toggleItem, toggleWalls,
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
  const title = titlePreview(list?.phase ?? null, date, mapWhat(walls, items));

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
        onToggle={(ids, on) => {
          onChange(toggleWalls(setup, index, value, ids, on));
        }}
      />
      <RevItems
        groups={itemsByRev(setup, value.listId)}
        index={index}
        pick={value}
        colors={colors}
        onToggle={(id) => {
          onChange(toggleItem(value, id));
        }}
      />
      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Map title</span>
        <p className="break-words rounded-lg bg-page px-3 py-2.5 text-[13px] font-semibold leading-5 text-ink" data-testid="rev-title">
          {title}
        </p>
      </div>
    </div>
  );
}
