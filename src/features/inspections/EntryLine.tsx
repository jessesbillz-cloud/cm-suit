// One calendar line: a status dot (lib/status colors), the time and the type. My own requests and the team's show the
// IR number and company and open on click; other people's show only time, type and color.
import type { CalendarRow } from '../../data/inspections.types';
import { attendanceLabel, rowChip, typeLabel } from './model';
import { clockLabel } from './time';

interface EntryLineProps {
  row: CalendarRow;
  selected: boolean;
  onOpen: (id: string) => void;
}

export function EntryLine({ row, selected, onOpen }: EntryLineProps) {
  const chip = rowChip(row);
  const when = row.duration_kind === 'all_day' ? 'All day' : clockLabel(row.start_time);
  const openable = row.id !== null && !row.is_block;
  const attendance = attendanceLabel(row.attendance);
  const content = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-ink-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--status-${chip.status}-dot)` }} />
        {when}
        <span className="sr-only">{chip.label}</span>
      </span>
      <span className={`block break-words text-sm ${row.mine ? 'font-medium text-ink' : 'text-ink'}`}>
        {row.is_block ? 'Blocked' : typeLabel(row.kind, row.special_kind)}
      </span>
      {row.full_detail && !row.is_block ? (
        <span className="block break-words text-xs text-ink-2">
          IR {row.number} · {row.company}
          {attendance ? ` · ${attendance}` : ''}
        </span>
      ) : null}
    </>
  );
  const box = `block w-full rounded-md border px-2 py-1.5 text-left ${selected ? 'border-accent bg-accent-soft' : 'border-line bg-card'}`;
  if (!openable) {
    return (
      <div className={box} title={chip.label} data-testid="ir-entry">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      title={chip.label}
      data-testid="ir-entry"
      className={`${box} hover:border-accent`}
      onClick={() => {
        if (row.id !== null) onOpen(row.id);
      }}
    >
      {content}
    </button>
  );
}
