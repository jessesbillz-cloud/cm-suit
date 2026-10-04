// Due: what comes due in the next 60 days and everything late, soonest first. Each line: the whole title with its kind,
// who and where in the book with the due day (red when late), and the one-tap status for whoever manages them (a status
// chip for everyone else). A tap on the words opens the line beside the list.
import type { Requirement } from '../../data/requirements.types';
import { phoneRowClass } from '../../ui/Table';
import { DueText, KindChip, RequiredNote, StatusOf, StatusPick } from './RequirementBits';
import { rowFacts } from './model';
import { useStatusTap } from './useStatusTap';

interface DueViewProps {
  projectId: string;
  rows: Requirement[];
  selectedId: string | null;
  canManage: boolean;
  onOpen: (id: string) => void;
}

interface RowProps {
  row: Requirement;
  selected: boolean;
  canManage: boolean;
  onOpen: (id: string) => void;
  onStatus: (row: Requirement, status: Requirement['status']) => void;
}

function DueRow({ row, selected, canManage, onOpen, onStatus }: RowProps) {
  const facts = rowFacts(row);
  const open = () => {
    onOpen(row.id);
  };
  return (
    <li className={`${phoneRowClass(selected)} flex flex-col gap-1.5`} data-testid={`req-due-${row.id}`} aria-current={selected ? 'true' : undefined}>
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={open}>
        <span className="min-w-0 flex-1 whitespace-normal break-words text-[15px] font-medium leading-6 text-ink">{row.title}</span>
        <span className="shrink-0 pt-0.5 text-[13px] leading-5">
          <DueText row={row} testId={`req-due-when-${row.id}`} />
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* The same tap as the title, for the mouse; the title is the button for keyboards and screen readers. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="flex min-w-0 flex-1 basis-56 flex-wrap items-center gap-x-2 gap-y-1 text-left text-[13px] leading-5 text-ink-2"
          onClick={open}
        >
          <KindChip row={row} />
          {facts !== '' ? <span>{facts}</span> : null}
          <RequiredNote row={row} />
        </button>
        {canManage ? (
          <StatusPick status={row.status} short testId={`req-status-${row.id}`} onPick={(s) => { onStatus(row, s); }} />
        ) : (
          <StatusOf status={row.status} />
        )}
      </div>
    </li>
  );
}

export function DueView({ projectId, rows, selectedId, canManage, onOpen }: DueViewProps) {
  const status = useStatusTap(projectId);
  return (
    <ul className="divide-y divide-line" data-testid="req-due">
      {rows.map((r) => (
        <DueRow key={r.id} row={r} selected={selectedId === r.id} canManage={canManage} onOpen={onOpen} onStatus={status.tap} />
      ))}
    </ul>
  );
}
