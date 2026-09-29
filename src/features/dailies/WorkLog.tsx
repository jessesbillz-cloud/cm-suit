// The work log: one row per company or activity (description, crew, hours, carry over), each with its own camera.
// Removing a row offers Undo instead of asking first.
import type { ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import type { WorkRow } from '../../lib/dailies';
import { Button } from '../../ui/Button';
import { CheckField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { Section } from './Section';
import { INPUT, LABEL } from './styles';

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
    <li className="flex flex-col gap-2.5 py-3 first:pt-0" data-testid="work-row">
      <div className="flex items-end gap-1">
        <label className={`${LABEL} min-w-0 flex-1`}>
          Company
          <input
            className={`h-10 ${INPUT}`}
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
            className="flex h-10 w-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-page hover:text-ink"
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
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} w-20`}>
          Crew
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className={`h-10 tabular-nums ${INPUT}`}
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
            className={`h-10 tabular-nums ${INPUT}`}
            value={row.hours ?? ''}
            disabled={locked}
            onChange={(e) => {
              onChange({ hours: toNumber(e.target.value, false) });
            }}
          />
        </label>
        <div className="pb-0.5">
          <CheckField
            label="Carry over"
            checked={row.carry}
            disabled={locked}
            onChange={(carry) => {
              onChange({ carry });
            }}
          />
        </div>
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

  const canAdd = !locked && rows.length < MAX_ROWS;
  if (rows.length === 0 && !canAdd) return null;
  return (
    <Section title="Work log" count={rows.length}>
      {rows.length > 0 ? (
        <ul className="divide-y divide-line">
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
      {canAdd ? (
        <Button
          icon={Plus}
          className={`h-10 w-full border-dashed text-ink-2 shadow-none hover:text-ink ${rows.length > 0 ? 'mt-1' : ''}`}
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
      ) : null}
    </Section>
  );
}
