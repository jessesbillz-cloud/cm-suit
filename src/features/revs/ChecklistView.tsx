// Checklist: the fire marshal's sheet (Jesse, Oct 5). Per level, one row per wall (name, tag, rating) and one column
// per rev, each cell done (a check), failed, requested, open (or how many are done) or N/A in its lib/status color,
// with the level's totals under it. A wall's name opens the wall. Print (RevsTool) prints only this sheet, letter
// landscape: a copy of the tables sits at the end of the page, shown only when printing, while this view is open.
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import type { RevSetup } from '../../data/revs.types';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { EmptyState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { checklistOf, MARKS, type CheckCell, type CheckLevel } from './checklist';
import type { StatusIndex } from './model';

const PRINT_CSS =
  '@page { size: letter landscape; margin: 0.4in; } @media print { body > *:not(.rev-print) { display: none !important; } }';

function Mark({ cell }: { cell: CheckCell }) {
  const { key, label } = MARKS[cell.mark];
  const color = cell.mark === 'na' ? undefined : { color: `var(--status-${key}-fg)` };
  if (cell.mark === 'done') {
    return (
      <span className="inline-flex justify-center" style={color}>
        <Icon icon={Check} size={16} label={label} />
      </span>
    );
  }
  const text = cell.mark === 'open' && cell.passed > 0 ? `${String(cell.passed)}/${String(cell.needed)}` : label;
  return (
    <span className={cell.mark === 'na' ? 'text-ink-3' : 'font-medium'} style={color}>
      {text}
    </span>
  );
}

interface TableProps {
  level: CheckLevel;
  /** On screen: a wall's name opens it, and the cells carry test ids. In print: plain text. */
  onOpen?: ((id: string) => void) | undefined;
}

function CheckTable({ level, onOpen }: TableProps) {
  const head = 'border-b border-line px-2 py-1.5 text-left align-bottom text-[12px] font-semibold leading-4 text-ink-2';
  const cell = 'border-b border-line px-2 py-1.5 align-top';
  return (
    <table className="w-full border-collapse text-[13px] leading-5 print:text-[10px] print:leading-4" data-testid={onOpen ? 'rev-check-table' : undefined}>
      <thead>
        <tr>
          <th className={`${head} min-w-[9rem]`}>Wall</th>
          <th className={head}>Tag</th>
          <th className={head}>Rating</th>
          {level.revs.map((r) => (
            <th key={r.id} className={`${head} text-center`}>
              <span className="block">Rev {r.number}</span>
              <span className="block font-medium text-ink-3">{r.name}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {level.rows.map((row) => (
          <tr key={row.area.id} className="break-inside-avoid" data-testid={onOpen ? `rev-check-row-${row.area.id}` : undefined}>
            <td className={`${cell} break-words font-medium text-ink`}>
              {onOpen ? (
                <button type="button" className="text-left hover:text-accent hover:underline" onClick={() => { onOpen(row.area.id); }}>
                  {row.area.name}
                </button>
              ) : (
                row.area.name
              )}
            </td>
            <td className={`${cell} whitespace-nowrap text-ink-2`}>{row.area.wall_tag ?? ''}</td>
            <td className={`${cell} break-words text-ink-2`}>{row.area.rating ?? ''}</td>
            {row.cells.map((c) => (
              <td key={c.rev.id} className={`${cell} text-center`} data-mark={onOpen ? c.mark : undefined} data-testid={onOpen ? `rev-check-${String(c.rev.number)}` : undefined}>
                <Mark cell={c} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-semibold text-ink">
          <td colSpan={3} className="px-2 py-1.5 tabular-nums" data-testid={onOpen ? 'rev-check-walls-done' : undefined}>
            {`${String(level.wallsDone)} of ${String(level.rows.length)} walls done`}
          </td>
          {level.totals.map((t) => (
            <td key={t.rev.id} className="px-2 py-1.5 text-center tabular-nums" data-testid={onOpen ? `rev-check-total-${String(t.rev.number)}` : undefined}>
              {t.walls === 0 ? 'N/A' : `${String(t.done)}/${String(t.walls)}`}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

const titleOf = (l: CheckLevel, manyLists: boolean) => [manyLists ? l.list.name : null, l.list.phase, l.level].filter(Boolean).join(' · ');

interface ChecklistViewProps {
  setup: RevSetup;
  index: StatusIndex;
  /** The job's name, at the top of the printed sheet. */
  jobName: string;
  onOpen: (id: string) => void;
}

export function ChecklistView({ setup, index, jobName, onOpen }: ChecklistViewProps) {
  if (setup.areas.length === 0) {
    return (
      <Card>
        <EmptyState icon={TOOL_META.revs.icon} title="No walls yet." />
      </Card>
    );
  }
  const levels = checklistOf(setup, index);
  const manyLists = setup.lists.length > 1;
  return (
    <>
      <div className="flex flex-col gap-4" data-testid="rev-checklist">
        {levels.map((l) => (
          <Card key={`${l.list.id}:${l.level}`} padded={false} title={titleOf(l, manyLists)}>
            <div className="overflow-x-auto px-2 pb-2" data-testid="rev-check-level">
              <CheckTable level={l} onOpen={onOpen} />
            </div>
          </Card>
        ))}
      </div>
      {createPortal(
        <div className="rev-print hidden bg-card text-ink print:block">
          <style>{PRINT_CSS}</style>
          <h1 className="mb-3 text-[14px] font-semibold">{`${jobName} · Rated walls`}</h1>
          {levels.map((l) => (
            <section key={`${l.list.id}:${l.level}`} className="mb-4">
              <h2 className="mb-1 break-after-avoid text-[12px] font-semibold">{titleOf(l, manyLists)}</h2>
              <CheckTable level={l} />
            </section>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
