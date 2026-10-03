// The bar over the plan while a manager draws a wall: what the next tap does ("Tap the start", "Tap the end",
// "Corners, or Done"), Undo (the last point), Done and Close; then the wall's name in one short field, its list when
// the job has more than one, and Save. Big targets on a phone.
import { Check, Undo2, X } from 'lucide-react';
import type { RevList } from '../../../data/revs.types';
import { Button } from '../../../ui/Button';
import { ChipPick } from '../../../ui/ChipPick';
import { FIELD_CONTROL } from '../../../ui/Fields';

interface DrawBarProps {
  step: 'draw' | 'name';
  points: number;
  /** The line has two points apart: Done may go. */
  ready: boolean;
  /** The wall being placed (its name), or null for a new wall. */
  placing: string | null;
  name: string;
  onName: (name: string) => void;
  lists: readonly RevList[];
  listId: string | null;
  onList: (id: string) => void;
  busy: boolean;
  isPhone: boolean;
  onUndo: () => void;
  onDone: () => void;
  onClose: () => void;
  onBack: () => void;
  onSave: () => void;
}

function prompt(points: number): string {
  if (points === 0) return 'Tap the start';
  if (points === 1) return 'Tap the end';
  return 'Corners, or Done';
}

const BAR = 'flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2';

export function DrawBar(p: DrawBarProps) {
  const size = p.isPhone ? 'lg' : 'md';
  if (p.step === 'name') {
    const control = p.isPhone ? FIELD_CONTROL.replace('h-10', 'h-12').replace('text-sm', 'text-base') : FIELD_CONTROL;
    return (
      <form
        className={`${BAR} flex-col items-stretch sm:flex-row sm:items-center`}
        data-testid="plan-name-bar"
        onSubmit={(e) => {
          e.preventDefault();
          p.onSave();
        }}
      >
        <input
          aria-label="Wall"
          className={`${control} w-full min-w-0 sm:w-auto sm:flex-1`}
          value={p.name}
          maxLength={160}
          // The field is the next step: the keyboard comes up with it.
          autoFocus
          placeholder="Electrical 0242 north (grid 7)"
          data-testid="plan-wall-name"
          onChange={(e) => {
            p.onName(e.target.value);
          }}
        />
        {p.lists.length > 1 ? (
          <ChipPick
            label="List"
            chips={p.lists.map((l) => ({ value: l.id, label: l.name }))}
            picked={p.listId ? [p.listId] : []}
            onChange={(ids) => {
              if (ids[0]) p.onList(ids[0]);
            }}
            testId="plan-list"
          />
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" size={size} className="flex-1 sm:flex-none" loading={p.busy} disabled={p.name.trim() === ''} data-testid="plan-wall-save">
            Save
          </Button>
          <Button size={size} onClick={p.onBack} data-testid="plan-wall-back">
            Back
          </Button>
        </div>
      </form>
    );
  }
  return (
    <div className={BAR} data-testid="plan-draw-bar" data-points={p.points}>
      <p className="min-w-0 flex-1 text-sm text-ink" aria-live="polite">
        {p.placing ? <span className="mr-1.5 break-words font-semibold">{p.placing}</span> : null}
        <span className="text-ink-2" data-testid="plan-prompt">
          {prompt(p.points)}
        </span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size={size} icon={Undo2} aria-label="Undo the last point" disabled={p.points === 0} onClick={p.onUndo} data-testid="plan-undo-point" />
        <Button variant="primary" size={size} icon={Check} loading={p.busy} disabled={!p.ready} onClick={p.onDone} data-testid="plan-done">
          Done
        </Button>
        <Button size={size} variant="quiet" icon={X} aria-label="Close" onClick={p.onClose} data-testid="plan-close" />
      </div>
    </div>
  );
}
