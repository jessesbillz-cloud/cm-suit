// A draft's rows in file order: the whole name, its dates (red "No date" where the start is missing), the Activity ID,
// area and trade, and "Check" on a row the reader wasn't sure of. A tap fixes the row in place. When some rows need
// dates or a check, buttons show only those. "Add row" adds one the reader missed, at the end.
import { useState } from 'react';
import { Flag, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { DraftRow } from '../../data/schedule.types';
import { ChipPick } from '../../ui/ChipPick';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { phoneRowClass } from '../../ui/Table';
import { DraftRowEdit } from './DraftRowEdit';
import { dateSpan } from './model';

/** Rows drawn at once (an XER can hold 5,000); the filters show every row that needs something. */
const SHOWN = 500;

type Filter = 'all' | 'dates' | 'check';

interface DraftRowsProps {
  projectId: string;
  versionId: string;
  rows: readonly DraftRow[];
}

/** The form for a new row, when it is open (never a row id). */
const NEW_ROW = 'new';

function Row({ row, onEdit }: { row: DraftRow; onEdit: () => void }) {
  const facts = [row.activity_code, row.area, row.trade].filter((x): x is string => x !== null && x !== '').join(' · ');
  return (
    <li>
      <button
        type="button"
        data-testid={`schedule-draft-row-${String(row.sort)}`}
        className={`${phoneRowClass(false)} flex flex-col gap-0.5 hover:bg-page/60 sm:py-2.5`}
        onClick={onEdit}
      >
        <span className="flex w-full items-start gap-3">
          <span className="flex min-w-0 flex-1 items-start gap-1.5 whitespace-normal break-words text-[15px] leading-6 text-ink">
            {row.is_milestone ? <Icon icon={Flag} size={15} label="Milestone" className="mt-[5px] shrink-0 text-accent" /> : null}
            <span className="min-w-0">{row.name}</span>
          </span>
          <span className={`shrink-0 pt-0.5 text-[13px] tabular-nums ${row.start_date === null ? 'font-medium text-danger' : 'text-ink-2'}`}>
            {dateSpan(row)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-[13px] leading-5 text-ink-3">
          {row.unsure ? <StatusChip status="pending" label="Check" /> : null}
          {facts}
        </span>
      </button>
    </li>
  );
}

export function DraftRows({ projectId, versionId, rows }: DraftRowsProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const dates = rows.filter((r) => r.start_date === null).length;
  const check = rows.filter((r) => r.unsure).length;
  const chips = [
    { value: 'all' as const, label: `All ${String(rows.length)}` },
    ...(dates > 0 ? [{ value: 'dates' as const, label: `Need dates ${String(dates)}` }] : []),
    ...(check > 0 ? [{ value: 'check' as const, label: `To check ${String(check)}` }] : []),
  ];
  // Once the last row of a filter is fixed, its button goes and the list shows every row again.
  const active: Filter = chips.some((c) => c.value === filter) ? filter : 'all';
  const shown = rows.filter((r) => (active === 'dates' ? r.start_date === null : active === 'check' ? r.unsure : true));
  return (
    <div className="flex flex-col" data-testid="schedule-draft-rows">
      {chips.length > 1 ? (
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <ChipPick
            label="Rows"
            chips={chips}
            picked={[active]}
            onChange={(p) => { setFilter(p[0] ?? 'all'); }}
            testId="schedule-draft-filter"
          />
        </div>
      ) : null}
      <ul className="divide-y divide-line">
        {shown.slice(0, SHOWN).map((r) =>
          r.id === editing ? (
            <DraftRowEdit key={r.id} projectId={projectId} versionId={versionId} row={r} onDone={() => { setEditing(null); }} />
          ) : (
            <Row key={r.id} row={r} onEdit={() => { setEditing(r.id); }} />
          ),
        )}
        {editing === NEW_ROW ? (
          <DraftRowEdit key={NEW_ROW} projectId={projectId} versionId={versionId} row={null} onDone={() => { setEditing(null); }} />
        ) : null}
      </ul>
      {shown.length > SHOWN ? <p className="px-4 py-3 text-[13px] text-ink-3">{SHOWN} of {shown.length}</p> : null}
      {shown.length === 0 && editing !== NEW_ROW ? <p className="px-4 py-6 text-center text-sm text-ink-2">Nothing here.</p> : null}
      {editing === NEW_ROW ? null : (
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <Button
            icon={Plus}
            data-testid="schedule-add-row"
            onClick={() => {
              setFilter('all');
              setEditing(NEW_ROW);
            }}
          >
            Add row
          </Button>
        </div>
      )}
    </div>
  );
}
