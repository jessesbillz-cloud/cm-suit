// The head of a Files list: its section's column names (desktop), and where some rows may be changed, a select-all box.
// With rows checked it becomes the bar for them: how many, Move to (the folders I may add to) and Delete.
import { Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { FIELD_CONTROL } from '../../ui/Fields';
import { CheckBox, type RowCheck } from './CheckBox';
import type { SectionKind } from './classify';
import { ACTION, MOVE } from './FileRow';
import { headCols } from './RowCells';
import type { MoveTarget } from './useMoveRows';

interface ListHeadProps {
  section: SectionKind;
  /** The rows have their own Move to (To sort): its column. */
  rowMove: boolean;
  /** Null: no row here may be changed (no checkboxes). */
  select: (RowCheck & { count: number }) | null;
  targets: readonly MoveTarget[];
  busy: boolean;
  onMove: (to: MoveTarget) => void;
  onDelete: () => void;
}

const LABELS = 'text-[12px] font-bold uppercase tracking-wide text-ink';

export function ListHead({ section, rowMove, select, targets, busy, onMove, onDelete }: ListHeadProps) {
  const cols = headCols(section);
  return (
    <div
      data-testid="files-list-head"
      className={`${select === null ? 'hidden sm:flex' : 'flex'} min-h-10 items-center gap-3 border-b border-line bg-card-head px-4`}
    >
      {select ? <CheckBox label="Select all" testId="files-select-all" check={select} /> : null}
      {select !== null && select.count > 0 ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-1">
          <span data-testid="files-selected-count" className="text-[13px] font-medium tabular-nums text-ink">
            {select.count} selected
          </span>
          {targets.length > 0 ? (
            <select
              aria-label="Move to"
              data-testid="files-move-to"
              className={`${FIELD_CONTROL} h-8 max-w-full`}
              value=""
              disabled={busy}
              onChange={(e) => {
                const to = targets.find((t) => t.id === e.target.value);
                if (to) onMove(to);
              }}
            >
              <option value="" disabled>
                Move to
              </option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          ) : null}
          <Button size="sm" variant="danger" icon={Trash2} data-testid="files-delete-selected" loading={busy} onClick={onDelete}>
            Delete
          </Button>
        </div>
      ) : (
        <div aria-hidden className={`hidden min-w-0 flex-1 items-center gap-3 sm:flex ${LABELS}`}>
          {section === 'plans' || section === 'submittals' ? null : <span className="w-8 shrink-0" />}
          {cols.lead.map((c) => (
            <span key={c.label} className={c.className}>
              {c.label}
            </span>
          ))}
          <span className="min-w-0 flex-1">{cols.main}</span>
          {cols.trail.map((c) => (
            <span key={c.label} className={c.className}>
              {c.label}
            </span>
          ))}
          {rowMove ? <span className={MOVE} /> : null}
          <span className={ACTION} />
        </div>
      )}
    </div>
  );
}
