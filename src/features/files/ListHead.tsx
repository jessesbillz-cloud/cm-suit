// The head of a Files list: the column names (desktop), and where some rows may be changed, a select-all box. With rows
// checked it becomes the bar for them: how many, Move to (the folders I may add to) and Delete.
import { Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { FIELD_CONTROL } from '../../ui/Fields';
import { CheckBox, type RowCheck } from './CheckBox';
import { ACTION, DATE, SIZE } from './FileRow';
import type { MoveTarget } from './useMoveRows';

interface ListHeadProps {
  /** Null: no row here may be changed (no checkboxes). */
  select: (RowCheck & { count: number }) | null;
  targets: readonly MoveTarget[];
  busy: boolean;
  onMove: (to: MoveTarget) => void;
  onDelete: () => void;
}

const LABELS = 'text-[12px] font-bold uppercase tracking-wide text-ink';

export function ListHead({ select, targets, busy, onMove, onDelete }: ListHeadProps) {
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
          <span className="min-w-0 flex-1 pl-11">Name</span>
          <span className={SIZE}>Size</span>
          <span className={DATE}>Added</span>
          <span className={ACTION} />
        </div>
      )}
    </div>
  );
}
