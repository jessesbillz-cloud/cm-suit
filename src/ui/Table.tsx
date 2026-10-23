// The one look for logs and lists (SPEC §7.4): column headers in the display face over a hard ink rule, rows at least 52px, a hover tint with a
// gray edge bar (ui/box ROW_HOVER), and
// the row open in the right column marked with the accent tint and a 4px accent bar on its left edge. Amber stays
// amber (impact claimed) and gets the bar too. Numbers are tabular. Titles wrap; nothing is cut off.
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { ROW_HOVER } from './box';
import { Icon } from './Icon';

export const TABLE = 'w-full table-fixed border-collapse text-sm';
export const HEAD_ROW = 'border-b-2 border-ink bg-card text-left';
export const TH = 'heading h-10 px-3 text-[13px] font-medium tracking-[0.08em] text-ink';
/** A cell. Its text wraps, even a long name with no spaces (a number or date cell adds whitespace-nowrap to stay whole). */
export const TD = 'px-3 py-3 align-middle wrap-anywhere';
/** A number or date cell. */
export const TD_NUM = `${TD} tabular-nums`;

const BAR = 'shadow-[inset_4px_0_0_theme(colors.accent.DEFAULT)]';

/** A clickable row: `selected` = open in the right column; `impact` = the amber row. */
export function rowClass(selected: boolean, impact = false): string {
  const base = 'h-[52px] cursor-pointer border-b border-line transition-colors last:border-b-0';
  if (impact) return `${base} bg-impact-row ${selected ? BAR : 'hover:bg-impact-row/70'}`;
  return selected ? `${base} bg-accent-soft/60 ${BAR}` : `${base} ${ROW_HOVER}`;
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
        className={`inline-flex h-7 items-center gap-1 rounded tracking-[0.08em] hover:text-accent ${active ? 'text-accent' : ''}`}
        onClick={onSort}
      >
        {title}
        {active ? <Icon icon={dir === 'asc' ? ArrowUp : ArrowDown} size={12} /> : null}
      </button>
    </th>
  );
}
