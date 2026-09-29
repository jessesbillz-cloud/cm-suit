// The one look for logs and lists (SPEC §7.4): small uppercase column headers, rows at least 52px, a hover tint, and
// the row open in the right column marked with the accent tint and a 3px accent bar on its left edge. Amber stays
// amber (impact claimed) and gets the bar too. Numbers are tabular. Titles wrap; nothing is cut off.
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Icon } from './Icon';

export const TABLE = 'w-full table-fixed border-collapse text-sm';
export const HEAD_ROW = 'border-b border-line bg-card-head text-left';
export const TH = 'h-10 px-3 text-[12px] font-medium uppercase tracking-wide text-ink-3';
export const TD = 'px-3 py-3 align-middle';
/** A number or date cell. */
export const TD_NUM = `${TD} tabular-nums`;

const BAR = 'shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]';

/** A clickable row: `selected` = open in the right column; `impact` = the amber row. */
export function rowClass(selected: boolean, impact = false): string {
  const base = 'h-[52px] cursor-pointer border-b border-line transition-colors last:border-b-0';
  if (impact) return `${base} bg-impact-row ${selected ? BAR : 'hover:bg-impact-row/70'}`;
  return selected ? `${base} bg-accent-soft/60 ${BAR}` : `${base} hover:bg-page/60`;
}

/** A phone list line: one stacked row, a big tap target, the same open-row marks. The caller sets the layout. */
export function phoneRowClass(selected: boolean, impact = false): string {
  const base = 'min-h-[56px] w-full px-4 py-3 text-left transition-colors active:bg-page';
  if (impact) return `${base} bg-impact-row ${selected ? BAR : ''}`;
  return selected ? `${base} bg-accent-soft/60 ${BAR}` : base;
}

interface SortThProps {
  title: ReactNode;
  /** This column sorts the table now. */
  active: boolean;
  dir: 'asc' | 'desc';
  onSort: () => void;
  className?: string | undefined;
  testId?: string | undefined;
  align?: 'left' | 'right' | undefined;
}

/** A column header that sorts on click. */
export function SortTh({ title, active, dir, onSort, className = '', testId, align = 'left' }: SortThProps) {
  return (
    <th className={`${TH} ${align === 'right' ? 'text-right' : ''} ${className}`} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        data-testid={testId}
        className={`inline-flex h-7 items-center gap-1 rounded uppercase tracking-wide hover:text-ink ${active ? 'text-ink-2' : ''}`}
        onClick={onSort}
      >
        {title}
        {active ? <Icon icon={dir === 'asc' ? ArrowUp : ArrowDown} size={12} /> : null}
      </button>
    </th>
  );
}
