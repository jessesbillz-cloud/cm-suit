// One board line, the same everywhere (the board, and docked in the right column), read at a glance (Jesse, Oct 23):
// a bar down its left edge in the color of what happened (lib/status), the type word in the display face, the summary
// (bold while unread, From MDR on a copy), who and when in muted text, and the chip that says what the color means. An
// impact claimed is the amber row with its words, never a chip. Wide: type, summary, chip in a row. Phone and the
// right column: type and chip on top, the summary under them.
import type { BoardLine } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { StatusChip } from '../../ui/StatusChip';
import { FromMdr } from '../inspections/FromMdr';
import type { LineLook } from './lineTone';

interface BoardLineRowProps {
  line: BoardLine;
  look: LineLook;
  fromMdr: boolean;
  /** The person who wrote the line, when I may see them. */
  who: string | null;
  showJob: boolean;
  zone: string;
  selected: boolean;
  /** The right column: always stacked. */
  compact: boolean;
  testId?: string | undefined;
  onOpen: (line: BoardLine) => void;
}

const GRID = {
  wide: 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]',
  compact: 'grid-cols-[minmax(0,1fr)_auto]',
};
const BODY = {
  wide: 'col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1',
  compact: 'col-span-2 row-start-2',
};
const END = { wide: 'col-start-2 row-start-1 sm:col-start-3', compact: 'col-start-2 row-start-1' };

function rowTone(look: LineLook, selected: boolean): string {
  if (look.tone === 'impact') return 'bg-impact-row hover:bg-impact-row/70';
  return selected ? 'bg-accent-soft/60' : 'hover:bg-page/60';
}

function End({ look, unread }: { look: LineLook; unread: boolean }) {
  const word =
    look.word === null ? null : look.tone === 'impact' ? (
      <span className="text-xs font-semibold leading-6 text-impact-ink">{look.word}</span>
    ) : (
      <StatusChip status={look.tone} label={look.word} />
    );
  return (
    <>
      {word}
      {unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-accent" role="img" aria-label="New" /> : null}
    </>
  );
}

export function BoardLineRow({ line, look, fromMdr, who, showJob, zone, selected, compact, testId, onOpen }: BoardLineRowProps) {
  const size = compact ? 'compact' : 'wide';
  const meta = [who ?? '', formatInZone(line.created_at, zone, 'h:mm a'), showJob ? line.project_name : ''].filter((s) => s !== '');
  const bar = look.tone === 'impact' ? 'bg-impact-ink' : '';
  return (
    <li>
      <button
        type="button"
        data-testid={testId}
        data-tone={look.tone}
        data-unread={line.unread ? 'true' : undefined}
        aria-current={selected ? 'true' : undefined}
        className={`relative grid w-full items-start gap-x-3 gap-y-1 py-3 pl-5 pr-4 text-left transition-colors ${GRID[size]} ${rowTone(look, selected)}`}
        onClick={() => {
          onOpen(line);
        }}
      >
        <span
          aria-hidden="true"
          data-testid="board-line-bar"
          className={`absolute inset-y-0 left-0 w-1 ${bar}`}
          style={look.tone === 'impact' ? undefined : { background: `var(--status-${look.tone}-solid)` }}
        />
        <span data-testid="board-line-type" className="heading col-start-1 row-start-1 text-[14px] font-semibold leading-6 text-ink">
          {look.type}
        </span>
        <span className={`min-w-0 ${BODY[size]}`}>
          <span className={`block break-words text-sm leading-6 text-ink ${line.unread ? 'font-semibold' : ''}`}>
            {line.summary}
            {fromMdr ? (
              <>
                {' '}
                <FromMdr />
              </>
            ) : null}
          </span>
          <span className="block text-[12px] leading-4 tabular-nums text-ink-2">{meta.join(' · ')}</span>
        </span>
        <span className={`flex items-center justify-self-end gap-2 ${END[size]}`}>
          <End look={look} unread={line.unread} />
        </span>
      </button>
    </li>
  );
}
