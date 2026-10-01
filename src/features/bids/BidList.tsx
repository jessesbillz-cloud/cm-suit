// One list shape for the bids sub-views: lead (code or number), full title (wraps, never cut), chips, date.
import type { ReactNode } from 'react';
import { OPEN_BAR, ROW_HOVER, ROW_OPEN } from './rowStyles';

interface BidListRow {
  id: string;
  lead: string;
  title: string;
  /** One quiet line under the title (e.g. the first line of a scope). */
  sub?: string | undefined;
  chips?: ReactNode;
  meta?: string | undefined;
}

interface BidListProps {
  rows: readonly BidListRow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  /** data-testid prefix, e.g. "question" -> question-row-<lead>. */
  testId: string;
}

export function BidList({ rows, selectedId, onOpen, testId }: BidListProps) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const open = r.id === selectedId;
        return (
          <li key={r.id}>
            <button
              type="button"
              data-testid={`${testId}-row-${r.lead}`}
              aria-current={open ? 'true' : undefined}
              className={`flex min-h-[52px] w-full items-start gap-3 px-4 py-2.5 text-left text-sm sm:items-center ${open ? `${ROW_OPEN} ${OPEN_BAR}` : ROW_HOVER}`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className="w-10 shrink-0 font-medium tabular-nums text-ink-2 sm:w-12">{r.lead}</span>
              {/* Desktop: chips and date on the title's line. Phone: one short line under the title. */}
              <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <span className="min-w-0 flex-1 wrap-anywhere">
                  <span className="block font-medium text-ink">{r.title}</span>
                  {r.sub ? <span className="block text-xs text-ink-2">{r.sub}</span> : null}
                </span>
                {r.chips || r.meta !== undefined ? (
                  <span className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:flex-nowrap sm:gap-3">
                    {r.chips ? <span className="flex items-center gap-1.5">{r.chips}</span> : null}
                    {r.meta !== undefined ? <span className="text-xs tabular-nums text-ink-2 sm:w-24 sm:text-right">{r.meta}</span> : null}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
