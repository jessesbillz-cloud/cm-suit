// The corrections log (SPEC §7.4): CN number, full title (wraps, never cut off), status, trade, location, opened,
// closed. Click a header to sort. When the log is narrow (the right column open on a laptop), trade, location and the
// dates fold under the title, as the RFI log keeps its lines under the title, and only No., Title and Status stay
// columns. On the phone: one stacked row per item (title, then number, trade and location).
import type { CorrectionRow } from '../../data/corrections.types';
import { formatInZone } from '../../lib/dates';
import { StatusChip } from '../../ui/StatusChip';
import { HEAD_ROW, SortTh, TABLE, TD, TD_NUM, phoneRowClass, rowClass } from '../../ui/Table';
import { useWidth } from '../revs/wall3d/useWidth';
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

/** Below this width the six columns leave the title too little room: fold. */
const FOLD_BELOW_PX = 820;
const FOLDED: readonly SortKey[] = ['number', 'title', 'status'];

function day(v: string | null, tz: string): string {
  return v === null ? '' : formatInZone(v, tz, 'MMM d');
}

interface HeaderProps {
  sort: Sort;
  onSort: (next: Sort) => void;
  folded: boolean;
}

function Header({ sort, onSort, folded }: HeaderProps) {
  const shown = folded ? COLUMNS.filter((c) => FOLDED.includes(c.key)) : COLUMNS;
  return (
    <thead>
      <tr className={HEAD_ROW}>
        {shown.map((c) => (
          <SortTh
            key={c.key}
            title={c.title}
            active={sort.key === c.key}
            dir={sort.dir}
            className={folded && c.key === 'status' ? `${c.className} pr-4` : c.className}
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

/** Trade, location and the dates, as one small line under the title (the folded log). */
function Under({ row, timeZone }: { row: CorrectionRow; timeZone: string }) {
  const dates = [day(row.created_at, timeZone), day(row.closed_at, timeZone)].filter((v) => v !== '').join(' – ');
  const bits = [row.trade, row.location, dates].filter((v) => v !== '');
  if (bits.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-ink-2" data-testid="cn-row-under">
      {bits.map((b, i) => (
        <span key={`${String(i)}-${b}`} className="contents">
          {i > 0 ? <span aria-hidden>·</span> : null}
          <span className="min-w-0 wrap-anywhere tabular-nums">{b}</span>
        </span>
      ))}
    </span>
  );
}

type DeskProps = Omit<CorrectionsLogProps, 'isPhone'> & { folded: boolean };

function DeskTable({ rows, timeZone, selectedId, sort, onSort, onOpen, folded }: DeskProps) {
  const top = folded ? 'align-top' : '';
  return (
    <table className={TABLE}>
      <Header sort={sort} onSort={onSort} folded={folded} />
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
              <td className={`${TD_NUM} pl-4 font-medium text-ink-2 ${top}`}>{cnLabel(r.number)}</td>
              <td className={`${TD} whitespace-normal break-words text-ink ${top}`}>
                {/* Keyboard reach: Enter on this button clicks through to the row's handler. */}
                <button type="button" className="text-left">
                  {r.title}
                </button>
                {folded ? <Under row={r} timeZone={timeZone} /> : null}
              </td>
              <td className={`${TD} ${folded ? 'pr-4 align-top' : ''}`}>
                <StatusChip status={chip.status} label={chip.label} />
              </td>
              {folded ? null : (
                <>
                  <td className={`${TD} whitespace-normal break-words text-ink-2`}>{r.trade}</td>
                  <td className={`${TD} whitespace-normal break-words text-ink-2`}>{r.location}</td>
                  <td className={`${TD_NUM} text-ink-2`}>{day(r.created_at, timeZone)}</td>
                  <td className={`${TD_NUM} pr-4 text-ink-2`}>{day(r.closed_at, timeZone)}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function CorrectionsLog({ isPhone, ...props }: CorrectionsLogProps) {
  const [frame, width] = useWidth(1024);
  const folded = !isPhone && width < FOLD_BELOW_PX;
  return (
    <div ref={frame} data-testid="cn-log" data-folded={folded ? 'true' : undefined}>
      {isPhone ? (
        <PhoneList rows={props.rows} selectedId={props.selectedId} onOpen={props.onOpen} />
      ) : (
        <DeskTable {...props} folded={folded} />
      )}
    </div>
  );
}
