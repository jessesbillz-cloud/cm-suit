// The corrections log (SPEC §7.4): CN number, full title (wraps, never cut off), status, trade, location, opened,
// closed. Click a header to sort. On the phone: one tappable line per item.
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { CorrectionRow } from '../../data/corrections.types';
import { formatInZone } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { cnLabel, nextSort, statusChip, type Sort, type SortKey } from './model';

interface CorrectionsLogProps {
  rows: readonly CorrectionRow[];
  timeZone: string;
  selectedId: string | null;
  sort: Sort;
  onSort: (next: Sort) => void;
  onOpen: (id: string) => void;
  isPhone: boolean;
}

const COLUMNS: { key: SortKey; title: string; className: string }[] = [
  { key: 'number', title: 'No.', className: 'w-20' },
  { key: 'title', title: 'Title', className: '' },
  { key: 'status', title: 'Status', className: 'w-28' },
  { key: 'trade', title: 'Trade', className: 'w-28' },
  { key: 'location', title: 'Location', className: 'w-32' },
  { key: 'opened', title: 'Opened', className: 'w-20' },
  { key: 'closed', title: 'Closed', className: 'w-20' },
];

function day(v: string | null, tz: string): string {
  return v === null ? '' : formatInZone(v, tz, 'MMM d');
}

interface HeaderProps {
  sort: Sort;
  onSort: (next: Sort) => void;
}

function Header({ sort, onSort }: HeaderProps) {
  return (
    <thead>
      <tr className="border-b border-line text-left text-xs text-ink-2">
        {COLUMNS.map((c) => {
          const active = sort.key === c.key;
          return (
            <th
              key={c.key}
              className={`px-3 py-2 font-medium ${c.className}`}
              aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button
                type="button"
                data-testid={`cn-sort-${c.key}`}
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

interface PhoneListProps {
  rows: readonly CorrectionRow[];
  onOpen: (id: string) => void;
}

function PhoneList({ rows, onOpen }: PhoneListProps) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const chip = statusChip(r.status);
        const where = [r.trade, r.location].filter((v) => v !== '').join(' · ');
        return (
          <li key={r.id}>
            <button
              type="button"
              data-testid={`log-row-${cnLabel(r.number)}`}
              className="flex w-full items-start gap-3 px-4 py-3 text-left"
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className="w-16 shrink-0 tabular-nums text-sm text-ink-2">{cnLabel(r.number)}</span>
              <span className="min-w-0 flex-1 whitespace-normal break-words">
                <span className="block text-sm text-ink">{r.title}</span>
                {where !== '' ? <span className="block text-xs text-ink-2">{where}</span> : null}
              </span>
              <StatusChip status={chip.status} label={chip.label} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function CorrectionsLog({ rows, timeZone, selectedId, sort, onSort, onOpen, isPhone }: CorrectionsLogProps) {
  if (isPhone) return <PhoneList rows={rows} onOpen={onOpen} />;
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <Header sort={sort} onSort={onSort} />
      <tbody>
        {rows.map((r) => {
          const chip = statusChip(r.status);
          return (
            <tr
              key={r.id}
              data-testid={`log-row-${cnLabel(r.number)}`}
              aria-current={selectedId === r.id ? 'true' : undefined}
              className={`cursor-pointer border-b border-line align-top ${selectedId === r.id ? 'bg-accent-soft' : 'hover:bg-page'}`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <td className="px-3 py-2 tabular-nums text-ink-2">{cnLabel(r.number)}</td>
              <td className="whitespace-normal break-words px-3 py-2 text-ink">
                {/* Keyboard reach: Enter on this button clicks through to the row's handler. */}
                <button type="button" className="text-left">
                  {r.title}
                </button>
              </td>
              <td className="px-3 py-2">
                <StatusChip status={chip.status} label={chip.label} />
              </td>
              <td className="whitespace-normal break-words px-3 py-2 text-ink-2">{r.trade}</td>
              <td className="whitespace-normal break-words px-3 py-2 text-ink-2">{r.location}</td>
              <td className="px-3 py-2 text-ink-2">{day(r.created_at, timeZone)}</td>
              <td className="px-3 py-2 text-ink-2">{day(r.closed_at, timeZone)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
