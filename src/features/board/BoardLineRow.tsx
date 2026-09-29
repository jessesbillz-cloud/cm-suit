// One board line, the same everywhere (the board, and docked in the right column): the kind's icon, the summary
// (bold while unread), then one meta line: when, the job on "All my jobs", and the kind. Stacks the same on a phone.
import type { BoardLine } from '../../data/types';
import { formatInZone, todayInZone } from '../../lib/dates';
import { humanize } from '../../lib/format';
import { KindSquare } from './KindSquare';
import { kindIcon } from './lineKind';

interface BoardLineRowProps {
  line: BoardLine;
  showJob: boolean;
  zone: string;
  selected: boolean;
  /** The right column: a smaller icon and tighter rows. */
  compact: boolean;
  testId?: string | undefined;
  onOpen: (line: BoardLine) => void;
}

/** Today's lines show the time only; older ones the day too. */
function when(at: string, zone: string): string {
  const today = formatInZone(at, zone, 'yyyy-MM-dd') === todayInZone(zone);
  return formatInZone(at, zone, today ? 'h:mm a' : 'MMM d, h:mm a');
}

export function BoardLineRow({ line, showJob, zone, selected, compact, testId, onOpen }: BoardLineRowProps) {
  const meta = [when(line.created_at, zone), showJob ? line.project_name : '', humanize(line.kind)].filter((s) => s !== '');
  const pad = compact ? 'gap-2.5 px-4 py-2.5' : 'min-h-[52px] gap-3 px-4 py-3';
  const state = selected
    ? 'bg-accent-soft/60 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent'
    : 'hover:bg-page/60';
  return (
    <li>
      <button
        type="button"
        data-testid={testId}
        data-unread={line.unread ? 'true' : undefined}
        aria-current={selected ? 'true' : undefined}
        className={`relative flex w-full items-start text-left transition-colors ${pad} ${state}`}
        onClick={() => {
          onOpen(line);
        }}
      >
        <KindSquare icon={kindIcon(line.entity_type, line.entity_id, line.kind)} size={compact ? 28 : 32} />
        <span className="min-w-0 flex-1">
          <span className={`block break-words text-sm leading-5 text-ink ${line.unread ? 'font-semibold' : ''}`}>
            {line.summary}
          </span>
          <span className="mt-0.5 block text-[12px] leading-4 tabular-nums text-ink-2">{meta.join(' · ')}</span>
        </span>
        {line.unread ? (
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" role="img" aria-label="New" />
        ) : null}
      </button>
    </li>
  );
}
