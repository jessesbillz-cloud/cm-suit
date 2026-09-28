// The pipeline's job list on the phone: one tappable card-row per job, full name (wraps), stage, bid due, packages
// covered and the counts. A sort picker replaces the column headers.
import type { PipelineRow } from '../../data/bids.pipeline';
import { DueCell, PackagesCell, StageCell } from './PipelineCells';
import type { PipelineSort, PipelineSortKey } from './pipeline';

interface PipelineListProps {
  rows: readonly PipelineRow[];
  onOpen: (projectId: string) => void;
}

const SORT_OPTIONS: { value: PipelineSortKey; label: string }[] = [
  { value: 'due', label: 'Bid due' },
  { value: 'job', label: 'Job' },
  { value: 'stage', label: 'Stage' },
  { value: 'packages', label: 'Packages' },
  { value: 'bids', label: 'Bids in' },
  { value: 'questions', label: 'Questions' },
];

function isSortKey(v: string): v is PipelineSortKey {
  return SORT_OPTIONS.some((o) => o.value === v);
}

/** The phone's sort: one short picker in the list's header. */
export function PipelineSortPicker({ sort, onSort }: { sort: PipelineSort; onSort: (key: PipelineSortKey) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-2">
      Sort
      <select
        data-testid="pipeline-sort"
        className="h-8 rounded-md border border-line-strong bg-card px-2 text-sm text-ink"
        value={sort.key}
        onChange={(e) => {
          if (isSortKey(e.target.value)) onSort(e.target.value);
        }}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Item({ row, onOpen }: { row: PipelineRow; onOpen: (projectId: string) => void }) {
  const detail = [row.number, row.org_name].filter((v) => v !== null && v !== '').join(' · ');
  return (
    <li>
      <button
        type="button"
        data-testid={`pipeline-row-${row.project_id}`}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left text-sm active:bg-page"
        onClick={() => {
          onOpen(row.project_id);
        }}
      >
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1 break-words">
            <span className="block font-medium text-ink">{row.name}</span>
            {detail ? <span className="block text-xs text-ink-2">{detail}</span> : null}
          </span>
          <StageCell stage={row.stage} />
        </span>
        <DueCell row={row} inline />
        <span className="flex items-end gap-4">
          <span className="min-w-0 flex-1">
            <PackagesCell row={row} />
          </span>
          <span className="shrink-0 text-right text-xs text-ink-2">
            <span className="tabular-nums text-ink">{row.bids_in}</span> {row.bids_in === 1 ? 'bid' : 'bids'}
            {row.open_questions > 0 ? (
              <>
                {' · '}
                <span className="tabular-nums font-medium text-ink">{row.open_questions}</span>{' '}
                {row.open_questions === 1 ? 'question' : 'questions'}
              </>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

export function PipelineList({ rows, onOpen }: PipelineListProps) {
  return (
    <ul className="divide-y divide-line" data-testid="pipeline-list">
      {rows.map((r) => (
        <Item key={r.project_id} row={r} onOpen={onOpen} />
      ))}
    </ul>
  );
}
