// The pipeline's job list on the desktop: job (full name, wraps; number and company under it), stage, bid due,
// packages covered, bids in, open questions. Click a header to sort; click a row to open that job's Bids.
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { PipelineRow } from '../../data/bids.pipeline';
import { Icon } from '../../ui/Icon';
import { DueCell, PackagesCell, StageCell } from './PipelineCells';
import type { PipelineSort, PipelineSortKey } from './pipeline';
import { ROW_HOVER, TH } from './rowStyles';

interface PipelineTableProps {
  rows: readonly PipelineRow[];
  sort: PipelineSort;
  onSort: (key: PipelineSortKey) => void;
  onOpen: (projectId: string) => void;
}

const COLUMNS: { key: PipelineSortKey; title: string; className: string }[] = [
  { key: 'job', title: 'Job', className: 'pl-4' },
  { key: 'stage', title: 'Stage', className: 'w-28' },
  { key: 'due', title: 'Bid due', className: 'w-40' },
  { key: 'packages', title: 'Packages', className: 'w-32' },
  { key: 'bids', title: 'Bids in', className: 'w-20 text-right' },
  { key: 'questions', title: 'Questions', className: 'w-24 pr-4 text-right' },
];

function Header({ sort, onSort }: { sort: PipelineSort; onSort: (key: PipelineSortKey) => void }) {
  return (
    <thead>
      <tr className={`border-b border-line text-left ${TH}`}>
        {COLUMNS.map((c) => {
          const active = sort.key === c.key;
          return (
            <th
              key={c.key}
              className={`px-3 py-2.5 font-medium ${c.className}`}
              aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button
                type="button"
                data-testid={`pipeline-sort-${c.key}`}
                className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink ${active ? 'text-ink' : ''}`}
                onClick={() => {
                  onSort(c.key);
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
  );
}

function Row({ row, onOpen }: { row: PipelineRow; onOpen: (projectId: string) => void }) {
  const detail = [row.number, row.org_name].filter((v) => v !== null && v !== '').join(' · ');
  return (
    <tr
      data-testid={`pipeline-row-${row.project_id}`}
      className={`border-b border-line align-top last:border-b-0 ${ROW_HOVER}`}
      onClick={() => {
        onOpen(row.project_id);
      }}
    >
      <td className="py-3 pl-4 pr-3">
        {/* Keyboard reach: Enter on this button clicks through to the row's handler. */}
        <button type="button" className="whitespace-normal break-words text-left font-medium text-ink">
          {row.name}
        </button>
        {detail ? <span className="block text-xs text-ink-2">{detail}</span> : null}
      </td>
      <td className="px-3 py-3">
        <StageCell stage={row.stage} />
      </td>
      <td className="px-3 py-3">
        <DueCell row={row} />
      </td>
      <td className="px-3 py-3">
        <PackagesCell row={row} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        <span className="block text-ink">{row.bids_in}</span>
        {row.invited > 0 ? <span className="block text-xs text-ink-2">{row.invited} invited</span> : null}
      </td>
      <td className={`py-3 pl-3 pr-4 text-right tabular-nums ${row.open_questions > 0 ? 'font-medium text-ink' : 'text-ink-3'}`}>
        {row.open_questions}
      </td>
    </tr>
  );
}

export function PipelineTable({ rows, sort, onSort, onOpen }: PipelineTableProps) {
  return (
    <table className="w-full table-fixed border-collapse text-sm" data-testid="pipeline-table">
      <Header sort={sort} onSort={onSort} />
      <tbody>
        {rows.map((r) => (
          <Row key={r.project_id} row={r} onOpen={onOpen} />
        ))}
      </tbody>
    </table>
  );
}
