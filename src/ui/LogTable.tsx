// The log table (SPEC §7.4), shared by RFIs, submittals, transmittals, IRs, corrections and deliveries.
// Columns: number, full title (wraps, never cut off), date asked, date answered. Click a header to sort.
// No ball-in-court or days-open columns, no expand/collapse. Amber row = impact claimed, nothing else.
// On a phone the date columns fold into one line under the title (one row per item, never a wide table).
import { useMemo, useState } from 'react';
import { formatInZone } from '../lib/dates';
import { SearchBox } from './SearchBox';
import { HEAD_ROW, SortTh, TABLE, TD, TD_NUM, rowClass } from './Table';

export interface LogRow {
  id: string;
  number: string;
  title: string;
  askedAt: string | null;
  answeredAt: string | null;
  /** Impact claimed by the originator: amber row. */
  impact?: boolean | undefined;
}

type SortKey = 'number' | 'title' | 'askedAt' | 'answeredAt';
type SortDir = 'asc' | 'desc';

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Stable sort; numbers compare naturally (RFI 9 before RFI 10); empty dates always sort last. */
export function sortLogRows(rows: readonly LogRow[], key: SortKey, dir: SortDir): LogRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sign * COLLATOR.compare(av, bv);
  });
}

interface LogTableProps {
  rows: readonly LogRow[];
  /** The project time zone: dates show in it (CLAUDE.md rule 14). */
  timeZone: string;
  onOpen: (id: string) => void;
  selectedId?: string | null | undefined;
  /** Log name for labels, e.g. "RFIs". */
  label: string;
}

const COLUMNS: { key: SortKey; title: string; className: string }[] = [
  { key: 'number', title: 'No.', className: 'w-16 sm:w-20' },
  { key: 'title', title: 'Title', className: '' },
  { key: 'askedAt', title: 'Asked', className: 'hidden w-32 sm:table-cell' },
  { key: 'answeredAt', title: 'Answered', className: 'hidden w-32 sm:table-cell' },
];

function dateCell(v: string | null, tz: string): string {
  return v === null ? '' : formatInZone(v, tz, 'MMM d, yyyy');
}

/** The phone's line under the title: "Asked Sep 3 · Answered Sep 5". */
function phoneLine(r: LogRow, tz: string): string {
  const asked = r.askedAt === null ? '' : `Asked ${formatInZone(r.askedAt, tz, 'MMM d')}`;
  const answered = r.answeredAt === null ? '' : `Answered ${formatInZone(r.answeredAt, tz, 'MMM d')}`;
  return [asked, answered].filter((s) => s !== '').join(' · ');
}

export function LogTable({ rows, timeZone, onOpen, selectedId, label }: LogTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'number', dir: 'desc' });
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q === '' ? rows : rows.filter((r) => r.number.toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
    return sortLogRows(filtered, sort.key, sort.dir);
  }, [rows, query, sort]);

  function openByNumber(typed: string) {
    const exact = rows.find((r) => r.number.toLowerCase() === typed.trim().toLowerCase());
    const target = exact ?? (visible.length === 1 ? visible[0] : undefined);
    if (target) onOpen(target.id);
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchBox label={`Search ${label}`} placeholder="Number or title" onChange={setQuery} onEnter={openByNumber} />
      <div className="overflow-hidden rounded-lg border border-line">
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <SortTh
                    key={c.key}
                    title={c.title}
                    active={active}
                    dir={sort.dir}
                    className={c.className}
                    onSort={() => {
                      setSort({ key: c.key, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' });
                    }}
                  />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const line = phoneLine(r, timeZone);
              return (
                <tr
                  key={r.id}
                  data-testid={`log-row-${r.number}`}
                  data-impact={r.impact === true ? 'true' : undefined}
                  aria-current={selectedId === r.id ? 'true' : undefined}
                  className={rowClass(selectedId === r.id, r.impact === true)}
                  onClick={() => {
                    onOpen(r.id);
                  }}
                >
                  <td className={`${TD_NUM} font-medium text-ink-2`}>{r.number}</td>
                  <td className={`${TD} whitespace-normal break-words text-ink`}>
                    {/* Keyboard reach: Enter on this button clicks through to the row's handler. */}
                    <button type="button" className="text-left">
                      {r.title}
                    </button>
                    {line !== '' ? <span className="mt-0.5 block text-xs tabular-nums text-ink-2 sm:hidden">{line}</span> : null}
                  </td>
                  <td className={`${TD_NUM} hidden text-ink-2 sm:table-cell`}>{dateCell(r.askedAt, timeZone)}</td>
                  <td className={`${TD_NUM} hidden text-ink-2 sm:table-cell`}>{dateCell(r.answeredAt, timeZone)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 ? <p className="px-3 py-8 text-center text-sm text-ink-2">Nothing matches.</p> : null}
      </div>
    </div>
  );
}
