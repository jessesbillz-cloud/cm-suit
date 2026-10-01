// The corrections log (SPEC §7.4): CN number, full title (wraps, never cut off), status, trade, location, opened,
// closed. Click a header to sort. On the phone: one stacked row per item (title, then number, trade and location).
import type { CorrectionRow } from '../../data/corrections.types';
import { formatInZone } from '../../lib/dates';
import { StatusChip } from '../../ui/StatusChip';
import { HEAD_ROW, SortTh, TABLE, TD, TD_NUM, phoneRowClass, rowClass } from '../../ui/Table';
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
  { key: 'number', title: 'No.', className: 'w-[5.5rem] pl-4' },
  { key: 'title', title: 'Title', className: '' },
  { key: 'status', title: 'Status', className: 'w-[7.5rem]' },
  { key: 'trade', title: 'Trade', className: 'w-28' },
  { key: 'location', title: 'Location', className: 'w-32' },
  { key: 'opened', title: 'Opened', className: 'w-[5.25rem]' },
  { key: 'closed', title: 'Closed', className: 'w-[5.25rem] pr-4' },
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
      <tr className={HEAD_ROW}>
        {COLUMNS.map((c) => (
          <SortTh
            key={c.key}
            title={c.title}
            active={sort.key === c.key}
            dir={sort.dir}
            className={c.className}
            testId={`cn-sort-${c.key}`}
            onSort={() => {
              onSort(nextSort(sort, c.key));
            }}
          />
        ))}
      </tr>
    </thead>
  );
}

interface PhoneListProps {
  rows: readonly CorrectionRow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}

function PhoneList({ rows, selectedId, onOpen }: PhoneListProps) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const chip = statusChip(r.status);
        const where = [r.trade, r.location].filter((v) => v !== '');
        return (
          <li key={r.id}>
            <button
              type="button"
              data-testid={`log-row-${cnLabel(r.number)}`}
              className={`${phoneRowClass(selectedId === r.id)} flex flex-col gap-1`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className="flex w-full items-start gap-3">
                <span className="min-w-0 flex-1 wrap-anywhere text-[15px] leading-6 text-ink">{r.title}</span>
                <span className="shrink-0 pt-px">
                  <StatusChip status={chip.status} label={chip.label} />
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-2">
                <span className="font-medium tabular-nums">{cnLabel(r.number)}</span>
                {where.map((w) => (
                  <span key={w} className="contents">
                    <span aria-hidden>·</span>
                    <span className="min-w-0 wrap-anywhere">{w}</span>
                  </span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function CorrectionsLog({ rows, timeZone, selectedId, sort, onSort, onOpen, isPhone }: CorrectionsLogProps) {
  if (isPhone) return <PhoneList rows={rows} selectedId={selectedId} onOpen={onOpen} />;
  return (
    <table className={TABLE}>
      <Header sort={sort} onSort={onSort} />
      <tbody>
        {rows.map((r) => {
          const chip = statusChip(r.status);
          const selected = selectedId === r.id;
          return (
            <tr
              key={r.id}
              data-testid={`log-row-${cnLabel(r.number)}`}
              aria-current={selected ? 'true' : undefined}
              className={rowClass(selected)}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <td className={`${TD_NUM} pl-4 font-medium text-ink-2`}>{cnLabel(r.number)}</td>
              <td className={`${TD} whitespace-normal break-words text-ink`}>
                {/* Keyboard reach: Enter on this button clicks through to the row's handler. */}
                <button type="button" className="text-left">
                  {r.title}
                </button>
              </td>
              <td className={TD}>
                <StatusChip status={chip.status} label={chip.label} />
              </td>
              <td className={`${TD} whitespace-normal break-words text-ink-2`}>{r.trade}</td>
              <td className={`${TD} whitespace-normal break-words text-ink-2`}>{r.location}</td>
              <td className={`${TD_NUM} text-ink-2`}>{day(r.created_at, timeZone)}</td>
              <td className={`${TD_NUM} pr-4 text-ink-2`}>{day(r.closed_at, timeZone)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
