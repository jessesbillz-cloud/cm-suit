// The RFI log (Jesse, Sep 30): two tight lines per RFI. Line 1: the number and the WHOLE title (it wraps, never cut
// off), the due date at the right (red once late). Line 2: the route strip, where it is and how long each person has
// had it. A tap opens it in the right column. No columns, no View buttons. Amber row = impact claimed, nothing else.
import type { RfiListRow, RfiProgressRow } from '../../data/rfis.types';
import { phoneRowClass } from '../../ui/Table';
import { rfiNumber, rowNumber } from './model';
import { dueMark } from './progress';
import { RouteStrip } from './RouteStrip';

interface RfiLogProps {
  rows: readonly RfiListRow[];
  /** Each RFI's steps (rfi_progress); undefined while they load. */
  strips: ReadonlyMap<string, readonly RfiProgressRow[]> | undefined;
  timeZone: string;
  now: Date;
  selectedId: string | null;
  onOpen: (id: string) => void;
  isPhone: boolean;
}

interface RowProps {
  row: RfiListRow;
  steps: readonly RfiProgressRow[] | undefined;
  timeZone: string;
  now: Date;
  selected: boolean;
  isPhone: boolean;
  onOpen: (id: string) => void;
}

function Right({ row, timeZone, now }: Pick<RowProps, 'row' | 'timeZone' | 'now'>) {
  if (row.status === 'void') return <span className="text-[13px] text-ink-3">Void</span>;
  const due = dueMark(row, timeZone, now);
  if (!due) return null;
  return (
    <span
      data-testid="rfi-due-mark"
      data-late={due.late ? 'true' : undefined}
      className={`whitespace-nowrap text-[13px] tabular-nums ${due.late ? 'font-semibold' : 'text-ink-2'}`}
      style={due.late ? { color: 'var(--status-late-fg)' } : undefined}
    >
      {due.text}
    </span>
  );
}

function Row({ row, steps, timeZone, now, selected, isPhone, onOpen }: RowProps) {
  const impact = row.impact_claimed_at !== null;
  return (
    <li>
      <button
        type="button"
        data-testid={`rfi-row-${rfiNumber(row.number)}`}
        data-impact={impact ? 'true' : undefined}
        aria-current={selected ? 'true' : undefined}
        className={`${phoneRowClass(selected, impact)} flex flex-col gap-2 ${selected || impact ? '' : 'hover:bg-page/60'} ${isPhone ? '' : 'py-2.5'}`}
        onClick={() => {
          onOpen(row.id);
        }}
      >
        <span className="flex w-full items-start gap-3">
          <span
            className={`shrink-0 pt-px text-[13px] font-medium tabular-nums leading-6 ${isPhone ? 'w-10' : 'w-12'} ${row.number === null ? 'text-ink-3' : 'text-ink-2'}`}
          >
            {rowNumber(row)}
          </span>
          <span className={`min-w-0 flex-1 whitespace-normal break-words text-[15px] leading-6 text-ink ${row.is_mine_to_act ? 'font-semibold' : ''}`}>
            {row.title}
          </span>
          <span className="shrink-0 pt-px leading-6">
            <Right row={row} timeZone={timeZone} now={now} />
          </span>
        </span>
        <span className={`block w-full ${isPhone ? '' : 'pl-[3.75rem]'}`}>
          {steps ? (
            <RouteStrip steps={steps} timeZone={timeZone} mine={row.is_mine_to_act} size="sm" />
          ) : (
            <span aria-hidden className={`block w-full animate-pulse rounded-[5px] bg-page ${isPhone ? 'h-[34px]' : 'h-6'}`} />
          )}
        </span>
      </button>
    </li>
  );
}

export function RfiLog({ rows, strips, timeZone, now, selectedId, onOpen, isPhone }: RfiLogProps) {
  return (
    <ul className="divide-y divide-line" data-testid="rfi-log">
      {rows.map((r) => (
        <Row
          key={r.id}
          row={r}
          steps={strips === undefined ? undefined : (strips.get(r.id) ?? [])}
          timeZone={timeZone}
          now={now}
          selected={selectedId === r.id}
          isPhone={isPhone}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}
