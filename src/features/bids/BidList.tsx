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
              className={`flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${open ? `${ROW_OPEN} ${OPEN_BAR}` : ROW_HOVER}`}
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className="w-12 shrink-0 font-medium tabular-nums text-ink-2">{r.lead}</span>
              <span className="min-w-0 flex-1 whitespace-normal break-words">
                <span className="block font-medium text-ink">{r.title}</span>
                {r.sub ? <span className="block text-xs text-ink-2">{r.sub}</span> : null}
              </span>
              {r.chips ? <span className="flex shrink-0 items-center gap-1.5">{r.chips}</span> : null}
              {r.meta !== undefined ? <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-2">{r.meta}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
