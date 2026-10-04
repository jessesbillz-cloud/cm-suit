// All: every kept line, grouped by kind or by spec section (the toggle). Each line: the whole title, its status chip,
// who and where in the book (or its kind, grouped by section), and the due day (red when late). A tap opens it.
import type { Requirement } from '../../data/requirements.types';
import { phoneRowClass } from '../../ui/Table';
import { DueText, KindChip, RequiredNote, StatusOf } from './RequirementBits';
import { groupRows, rowFacts, type Grouping } from './model';

interface AllViewProps {
  rows: Requirement[];
  by: Grouping;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

function AllRow({ row, by, selected, onOpen }: { row: Requirement; by: Grouping; selected: boolean; onOpen: (id: string) => void }) {
  const facts = by === 'section' ? row.responsible : rowFacts(row);
  return (
    <li>
      <button
        type="button"
        data-testid={`req-row-${row.id}`}
        aria-current={selected ? 'true' : undefined}
        className={`${phoneRowClass(selected)} flex flex-col gap-1 ${selected ? '' : 'hover:bg-page/60'}`}
        onClick={() => { onOpen(row.id); }}
      >
        <span className="flex w-full items-start gap-3">
          <span className="min-w-0 flex-1 whitespace-normal break-words text-[15px] leading-6 text-ink">{row.title}</span>
          <span className="shrink-0 pt-0.5">
            <StatusOf status={row.status} />
          </span>
        </span>
        <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-ink-2">
          {by === 'section' ? <KindChip row={row} /> : null}
          {facts !== '' ? <span>{facts}</span> : null}
          <RequiredNote row={row} />
          <span className="ml-auto">
            <DueText row={row} />
          </span>
        </span>
      </button>
    </li>
  );
}

export function AllView({ rows, by, selectedId, onOpen }: AllViewProps) {
  return (
    <div data-testid="req-all">
      {groupRows(rows, by).map((g) => (
        <section key={g.key} data-testid={`req-group-${g.key}`}>
          <h2 className="border-b border-line bg-card-head px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">{g.label}</h2>
          <ul className="divide-y divide-line">
            {g.rows.map((r) => (
              <AllRow key={r.id} row={r} by={by} selected={selectedId === r.id} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
