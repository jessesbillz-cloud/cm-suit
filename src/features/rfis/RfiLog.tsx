// The RFI log (SPEC §7.4): number (or Draft), full title (wraps, never cut off), status, asked, due, answered. Click a
// header to sort (a third click goes back to the default order). Amber row = impact claimed, nothing else. RFIs that
// wait on me say "Your turn". On the phone: one tappable line per RFI.
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { RfiListRow } from '../../data/rfis.types';
import { formatInZone } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { dueCell, dueLine, nextSort, rfiNumber, statusChip, type Sort, type SortKey } from './model';

interface RfiLogProps {
  rows: readonly RfiListRow[];
  timeZone: string;
  now: Date;
  selectedId: string | null;
  sort: Sort;
  onSort: (next: Sort) => void;
  onOpen: (id: string) => void;
  isPhone: boolean;
}

const COLUMNS: { key: SortKey; title: string; className: string }[] = [
  { key: 'number', title: 'No.', className: 'w-[4.5rem]' },
  { key: 'title', title: 'Title', className: '' },
  { key: 'status', title: 'Status', className: 'w-32' },
  { key: 'asked', title: 'Asked', className: 'w-[5.5rem]' },
  { key: 'due', title: 'Due', className: 'w-28' },
  { key: 'answered', title: 'Answered', className: 'w-24' },
];

function day(v: string | null, tz: string): string {
  return v === null ? '' : formatInZone(v, tz, 'MMM d');
}

/** Amber stays amber when selected (the open row then carries an accent edge instead). */
function rowTint(r: RfiListRow, selected: boolean): string {
  const edge = selected ? 'shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]' : '';
  if (r.impact_claimed_at !== null) return `bg-impact-row ${edge}`;
  return selected ? `bg-accent-soft ${edge}` : 'hover:bg-page';
}

function Header({ sort, onSort }: { sort: Sort; onSort: (next: Sort) => void }) {
  return (
    <thead>
      <tr className="border-b border-line bg-card-head text-left text-xs text-ink-2">
        {COLUMNS.map((c) => {
          const active = sort?.key === c.key;
          return (
            <th
              key={c.key}
              className={`px-3 py-2 font-medium ${c.className}`}
              aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button
                type="button"
                data-testid={`rfi-sort-${c.key}`}
                className="inline-flex items-center gap-1 hover:text-ink"
                onClick={() => {
                  onSort(nextSort(sort, c.key));
                }}
              >
                {c.title}
                {active ? <Icon icon={sort.dir === 'asc' ? ArrowUp : ArrowDown} size={12} /> : null}
              </button>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

function YourTurn() {
  return <span className="mt-1 block text-xs font-medium text-accent">Your turn</span>;
}

function PhoneList({ rows, timeZone, now, onOpen }: Pick<RfiLogProps, 'rows' | 'timeZone' | 'now' | 'onOpen'>) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const chip = statusChip(r.status);
        const due = dueLine(r, timeZone, now);
        return (
          <li key={r.id} className={r.impact_claimed_at !== null ? 'bg-impact-row' : ''} data-impact={r.impact_claimed_at !== null ? 'true' : undefined}>
            <button
              type="button"
              data-testid={`rfi-row-${rfiNumber(r.number)}`}
              className="flex w-full items-start gap-3 px-4 py-3 text-left"
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className="w-12 shrink-0 pt-px text-sm tabular-nums text-ink-2">{rfiNumber(r.number)}</span>
              <span className="min-w-0 flex-1 whitespace-normal break-words">
                <span className={`block text-sm text-ink ${r.is_mine_to_act ? 'font-medium' : ''}`}>{r.title}</span>
                {due ? <span className={`block text-xs ${due.late ? 'font-medium text-danger' : 'text-ink-2'}`}>{due.text}</span> : null}
                {r.is_mine_to_act ? <YourTurn /> : null}
              </span>
              <StatusChip status={chip.status} label={chip.label} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function RfiLog({ rows, timeZone, now, selectedId, sort, onSort, onOpen, isPhone }: RfiLogProps) {
  if (isPhone) return <PhoneList rows={rows} timeZone={timeZone} now={now} onOpen={onOpen} />;
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <Header sort={sort} onSort={onSort} />
      <tbody>
        {rows.map((r) => {
          const chip = statusChip(r.status);
          const due = dueCell(r, timeZone, now);
          const selected = selectedId === r.id;
          return (
            <tr
              key={r.id}
              data-testid={`rfi-row-${rfiNumber(r.number)}`}
              data-impact={r.impact_claimed_at !== null ? 'true' : undefined}
              aria-current={selected ? 'true' : undefined}
              className={`cursor-pointer border-b border-line align-top last:border-b-0 ${rowTint(r, selected)}`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <td className="px-3 py-2.5 tabular-nums text-ink-2">{rfiNumber(r.number)}</td>
              <td className="whitespace-normal break-words px-3 py-2.5 text-ink">
                {/* Keyboard reach: Enter on this button clicks through to the row's handler. */}
                <button type="button" className={`text-left ${r.is_mine_to_act ? 'font-medium' : ''}`}>
                  {r.title}
                </button>
              </td>
              <td className="px-3 py-2.5">
                <StatusChip status={chip.status} label={chip.label} />
                {r.is_mine_to_act ? <YourTurn /> : null}
              </td>
              <td className="px-3 py-2.5 tabular-nums text-ink-2">{day(r.sent_at, timeZone)}</td>
              <td className={`px-3 py-2.5 tabular-nums ${due?.late === true ? 'font-medium text-danger' : 'text-ink-2'}`}>{due?.text ?? ''}</td>
              <td className="px-3 py-2.5 tabular-nums text-ink-2">{day(r.answered_at, timeZone)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
