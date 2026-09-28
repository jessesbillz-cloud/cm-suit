// The work log: one row per company or activity (description, crew, hours, carry over), each with its own camera.
// Removing a row offers Undo instead of asking first.
import type { ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import type { WorkRow } from '../../lib/dailies';
import { Button } from '../../ui/Button';
import { CheckField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';

const INPUT = 'rounded-md border border-line bg-card px-2.5 text-sm text-ink outline-none focus:border-accent disabled:bg-page';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';
const MAX_ROWS = 200;

/** '' is no value; anything else must be a number of at least 0. */
function toNumber(text: string, whole: boolean): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return whole ? Math.round(n) : n;
}

interface WorkRowFieldsProps {
  row: WorkRow;
  locked: boolean;
  onChange: (patch: Partial<WorkRow>) => void;
  onRemove: () => void;
  camera: ReactNode;
}

function WorkRowFields({ row, locked, onChange, onRemove, camera }: WorkRowFieldsProps) {
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line p-3" data-testid="work-row">
      <div className="flex items-end gap-2">
        <label className={`${LABEL} min-w-0 flex-1`}>
          Company
          <input
            className={`h-9 ${INPUT}`}
            value={row.company}
            disabled={locked}
            maxLength={200}
            onChange={(e) => {
              onChange({ company: e.target.value });
            }}
          />
        </label>
        {locked ? null : camera}
        {locked ? null : (
          <button
            type="button"
            aria-label="Remove row"
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-page hover:text-ink"
            onClick={onRemove}
          >
            <Icon icon={X} size={18} />
          </button>
        )}
      </div>
      <label className={LABEL}>
        Work
        <textarea
          rows={2}
          className={`py-2 ${INPUT}`}
          value={row.description}
          disabled={locked}
          maxLength={4000}
          onChange={(e) => {
            onChange({ description: e.target.value });
          }}
        />
      </label>
      <div className="flex items-end gap-3">
        <label className={`${LABEL} w-20`}>
          Crew
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className={`h-9 ${INPUT}`}
            value={row.headcount ?? ''}
            disabled={locked}
            onChange={(e) => {
              onChange({ headcount: toNumber(e.target.value, true) });
            }}
          />
        </label>
        <label className={`${LABEL} w-24`}>
          Hours
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.25}
            className={`h-9 ${INPUT}`}
            value={row.hours ?? ''}
            disabled={locked}
            onChange={(e) => {
              onChange({ hours: toNumber(e.target.value, false) });
            }}
          />
        </label>
        <CheckField
          label="Carry over"
          checked={row.carry}
          disabled={locked}
          onChange={(carry) => {
            onChange({ carry });
          }}
        />
      </div>
    </li>
  );
}

interface WorkLogProps {
  rows: readonly WorkRow[];
  locked: boolean;
  onRows: (change: (rows: WorkRow[]) => WorkRow[]) => void;
  /** The camera for one row (photos land on the report, linked to that row). */
  cameraFor: (rowKey: string) => ReactNode;
}

export function WorkLog({ rows, locked, onRows, cameraFor }: WorkLogProps) {
  const toast = useToast();

  function remove(index: number) {
    const gone = rows[index];
    if (!gone) return;
    onRows((list) => list.filter((r) => r.key !== gone.key));
    toast.show({
      message: 'Row removed.',
      action: {
        label: 'Undo',
        onClick: () => {
          onRows((list) => [...list.slice(0, index), gone, ...list.slice(index)]);
        },
      },
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">Work log</h3>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <WorkRowFields
              key={row.key}
              row={row}
              locked={locked}
              camera={cameraFor(row.key)}
              onChange={(patch) => {
                onRows((list) => list.map((r) => (r.key === row.key ? { ...r, ...patch } : r)));
              }}
              onRemove={() => {
                remove(i);
              }}
            />
          ))}
        </ul>
      ) : null}
      {locked || rows.length >= MAX_ROWS ? null : (
        <Button
          size="sm"
          icon={Plus}
          className="w-fit"
          data-testid="work-add"
          onClick={() => {
            // The key only links photos to this row inside the report; the database never uses it as an id.
            onRows((list) => [
              ...list,
              { key: crypto.randomUUID(), company: '', description: '', headcount: null, hours: null, carry: false },
            ]);
          }}
        >
          Add row
        </Button>
      )}
    </section>
  );
}
