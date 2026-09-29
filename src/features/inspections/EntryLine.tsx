// One calendar line: an edge in its status color (lib/status), the time and the type. My own requests and the team's
// show the IR number and company and open on click; other people's show only time, type and color.
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
      <span className="block text-xs font-medium tabular-nums text-ink-2">
        {when}
        <span className="sr-only"> {chip.label}</span>
      </span>
      <span className={`block break-words text-[13px] leading-5 ${row.mine ? 'font-semibold' : 'font-medium'} text-ink`}>
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
  const box = `block w-full rounded-md border border-l-[3px] px-2 py-1.5 text-left ${
    selected ? 'border-accent bg-accent-soft/60 ring-1 ring-accent/30' : row.is_block ? 'border-line bg-page/60' : 'border-line bg-card shadow-control'
  }`;
  const edge = { borderLeftColor: `var(--status-${chip.status}-dot)` };
  if (!openable) {
    return (
      <div className={box} style={edge} title={chip.label} data-testid="ir-entry">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      title={chip.label}
      data-testid="ir-entry"
      className={`${box} hover:border-line-strong hover:bg-page/40`}
      style={edge}
      onClick={() => {
        if (row.id !== null) onOpen(row.id);
      }}
    >
      {content}
    </button>
  );
}
