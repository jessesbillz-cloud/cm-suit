// The RFI log (SPEC §7.4): number (or Draft), full title (wraps, never cut off), status, asked, due, answered. Click a
// header to sort (a third click goes back to the default order). Amber row = impact claimed, nothing else. RFIs that
// wait on me say "Your turn". On the phone: one stacked row per RFI (title, then one line of number, due, turn).
import type { RfiListRow } from '../../data/rfis.types';
import { formatInZone } from '../../lib/dates';
import { StatusChip } from '../../ui/StatusChip';
import { HEAD_ROW, SortTh, TABLE, TD, TD_NUM, phoneRowClass, rowClass } from '../../ui/Table';
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
  { key: 'number', title: 'No.', className: 'w-[4.75rem] pl-4' },
  { key: 'title', title: 'Title', className: '' },
  { key: 'status', title: 'Status', className: 'w-[8.5rem]' },
  { key: 'asked', title: 'Asked', className: 'w-[5.5rem]' },
  { key: 'due', title: 'Due', className: 'w-28' },
  { key: 'answered', title: 'Answered', className: 'w-[6.5rem] pr-4' },
];

function day(v: string | null, tz: string): string {
  return v === null ? '' : formatInZone(v, tz, 'MMM d');
}

function Header({ sort, onSort }: { sort: Sort; onSort: (next: Sort) => void }) {
  return (
    <thead>
      <tr className={HEAD_ROW}>
        {COLUMNS.map((c) => (
          <SortTh
            key={c.key}
            title={c.title}
            active={sort?.key === c.key}
            dir={sort?.dir ?? 'asc'}
            className={c.className}
            testId={`rfi-sort-${c.key}`}
            onSort={() => {
              onSort(nextSort(sort, c.key));
            }}
          />
        ))}
      </tr>
    </thead>
  );
}

function YourTurn() {
  return <span className="text-xs font-semibold text-accent">Your turn</span>;
}

function PhoneList({ rows, timeZone, now, selectedId, onOpen }: Pick<RfiLogProps, 'rows' | 'timeZone' | 'now' | 'selectedId' | 'onOpen'>) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const chip = statusChip(r.status);
        const due = dueLine(r, timeZone, now);
        const impact = r.impact_claimed_at !== null;
        return (
          <li key={r.id} data-impact={impact ? 'true' : undefined}>
            <button
              type="button"
              data-testid={`rfi-row-${rfiNumber(r.number)}`}
              className={`${phoneRowClass(selectedId === r.id, impact)} flex flex-col gap-1`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className="flex w-full items-start gap-3">
                <span className={`min-w-0 flex-1 whitespace-normal break-words text-[15px] leading-6 text-ink ${r.is_mine_to_act ? 'font-semibold' : ''}`}>
                  {r.title}
                </span>
                <span className="shrink-0 pt-px">
                  <StatusChip status={chip.status} label={chip.label} />
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-2">
                <span className="font-medium tabular-nums">{rfiNumber(r.number)}</span>
                {due ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className={due.late ? 'font-semibold text-danger' : ''}>{due.text}</span>
                  </>
                ) : null}
                {r.is_mine_to_act ? (
                  <>
                    <span aria-hidden>·</span>
                    <YourTurn />
                  </>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function RfiLog({ rows, timeZone, now, selectedId, sort, onSort, onOpen, isPhone }: RfiLogProps) {
  if (isPhone) return <PhoneList rows={rows} timeZone={timeZone} now={now} selectedId={selectedId} onOpen={onOpen} />;
  return (
    <table className={TABLE}>
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
              className={rowClass(selected, r.impact_claimed_at !== null)}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <td className={`${TD_NUM} pl-4 font-medium ${r.number === null ? 'text-ink-3' : 'text-ink-2'}`}>{rfiNumber(r.number)}</td>
              <td className={`${TD} whitespace-normal break-words text-ink`}>
                {/* Keyboard reach: Enter on this button clicks through to the row's handler. */}
                <button type="button" className={`text-left ${r.is_mine_to_act ? 'font-semibold' : ''}`}>
                  {r.title}
                </button>
              </td>
              <td className={TD}>
                <span className="flex flex-col items-start gap-1">
                  <StatusChip status={chip.status} label={chip.label} />
                  {r.is_mine_to_act ? <YourTurn /> : null}
                </span>
              </td>
              <td className={`${TD_NUM} text-ink-2`}>{day(r.sent_at, timeZone)}</td>
              <td className={`${TD_NUM} ${due?.late === true ? 'font-semibold text-danger' : 'text-ink-2'}`}>{due?.text ?? ''}</td>
              <td className={`${TD_NUM} pr-4 text-ink-2`}>{day(r.answered_at, timeZone)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
