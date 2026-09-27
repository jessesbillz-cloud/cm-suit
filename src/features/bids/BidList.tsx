// One list shape for the bids sub-views: lead (code or number), full title (wraps, never cut), chips, date.
import type { ReactNode } from 'react';

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
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            data-testid={`${testId}-row-${r.lead}`}
            aria-current={r.id === selectedId ? 'true' : undefined}
            className={`flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm ${r.id === selectedId ? 'bg-accent-soft' : 'hover:bg-page'}`}
            onClick={() => {
              onOpen(r.id);
            }}
          >
            <span className="w-12 shrink-0 tabular-nums text-ink-2">{r.lead}</span>
            <span className="min-w-0 flex-1 whitespace-normal break-words">
              <span className="block text-ink">{r.title}</span>
              {r.sub ? <span className="block text-xs text-ink-2">{r.sub}</span> : null}
            </span>
            {r.chips ? <span className="flex shrink-0 items-center gap-1.5">{r.chips}</span> : null}
            {r.meta !== undefined ? <span className="w-24 shrink-0 text-right text-xs text-ink-2">{r.meta}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
