// The log table (SPEC §7.4), shared by RFIs, submittals, transmittals, IRs, corrections and deliveries.
// Columns: number, full title (wraps, never cut off), date asked, date answered. Click a header to sort.
// No ball-in-court or days-open columns, no expand/collapse. Amber row = impact claimed, nothing else.
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { formatInZone } from '../lib/dates';
import { Icon } from './Icon';

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
  { key: 'number', title: 'No.', className: 'w-20' },
  { key: 'title', title: 'Title', className: '' },
  { key: 'askedAt', title: 'Asked', className: 'w-32' },
  { key: 'answeredAt', title: 'Answered', className: 'w-32' },
];

function dateCell(v: string | null, tz: string): string {
  return v === null ? '' : formatInZone(v, tz, 'MMM d, yyyy');
}

/** @public Consumed by the Phase 1+ logs; Phase 0 ships the component and its tests. */
export function LogTable({ rows, timeZone, onOpen, selectedId, label }: LogTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'number', dir: 'desc' });
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q === '' ? rows : rows.filter((r) => r.number.toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
    return sortLogRows(filtered, sort.key, sort.dir);
  }, [rows, query, sort]);

  function openByNumber() {
    const exact = rows.find((r) => r.number.toLowerCase() === query.trim().toLowerCase());
    const target = exact ?? (visible.length === 1 ? visible[0] : undefined);
    if (target) onOpen(target.id);
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-9 items-center gap-2 rounded-md border border-line bg-card px-3 text-sm focus-within:border-accent">
        <Icon icon={Search} size={16} className="text-ink-3" />
        <input
          type="search"
          aria-label={`Search ${label}`}
          placeholder={`Search ${label} by number or title`}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openByNumber();
          }}
        />
      </label>
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-card-head text-left text-xs text-ink-2">
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
                    className="inline-flex items-center gap-1 hover:text-ink"
                    onClick={() => {
                      setSort({ key: c.key, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' });
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
        <tbody>
          {visible.map((r) => (
            <tr
              key={r.id}
              data-testid={`log-row-${r.number}`}
              data-impact={r.impact === true ? 'true' : undefined}
              className={`cursor-pointer border-b border-line align-top ${r.impact === true ? 'bg-impact-row' : ''} ${
                selectedId === r.id ? 'bg-accent-soft' : 'hover:bg-page'
              }`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <td className="px-3 py-2 tabular-nums text-ink-2">{r.number}</td>
              <td className="whitespace-normal break-words px-3 py-2 text-ink">
                {/* Keyboard reach: Enter on this button clicks through to the row's handler. */}
                <button type="button" className="text-left">
                  {r.title}
                </button>
              </td>
              <td className="px-3 py-2 text-ink-2">{dateCell(r.askedAt, timeZone)}</td>
              <td className="px-3 py-2 text-ink-2">{dateCell(r.answeredAt, timeZone)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {visible.length === 0 ? <p className="px-3 py-6 text-center text-sm text-ink-2">Nothing matches.</p> : null}
    </div>
  );
}
