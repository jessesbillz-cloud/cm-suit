// Pieces of "Form fields" in Setup (SPEC §18.1 principle 10): one row per field, table or column (its tick, its name to
// type over, up and down, and Remove on one of the company's own), and the small box that adds a field or a column.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { FORM_SETUP_LIMITS } from '../../lib/dailies';
import { Button } from '../../ui/Button';
import { ChipPick } from '../../ui/ChipPick';
import { INPUT } from './styles';

const KINDS = [
  { value: 'short', label: 'Short' },
  { value: 'long', label: 'Long' },
] as const;

interface SetupRowProps {
  /** "form-setup-field-notes": the row's test id, and the start of its controls'. */
  testId: string;
  on: boolean;
  /** The company's name for it, or null for ours. */
  label: string | null;
  /** Our name for it ('' for one of the company's own, which always has a name). */
  standard: string;
  /** A table's own row: its name stands out from its columns'. */
  strong?: boolean | undefined;
  disabled: boolean;
  canUp: boolean;
  canDown: boolean;
  onOn: (on: boolean) => void;
  onRename: (label: string | null) => void;
  onMove: (by: -1 | 1) => void;
  /** One of the company's own: it can be taken off. */
  onRemove?: (() => void) | undefined;
}

export function SetupRow(props: SetupRowProps) {
  const { testId, on, label, standard, strong, disabled, canUp, canDown, onOn, onRename, onMove, onRemove } = props;
  // What is being typed; null while the name is not being changed.
  const [typed, setTyped] = useState<string | null>(null);
  const name = label ?? standard;

  function commit() {
    if (typed === null) return;
    const text = typed.trim();
    setTyped(null);
    if (text === name) return;
    // Emptied or typed back to ours: our name again. One of the company's own keeps its name when emptied.
    if (text === '' || text === standard) {
      if (standard !== '' && label !== null) onRename(null);
      return;
    }
    onRename(text);
  }

  return (
    <li className="flex items-center gap-1.5" data-testid={testId}>
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-accent"
        aria-label={`Show ${name}`}
        checked={on}
        disabled={disabled}
        data-testid={`${testId}-on`}
        onChange={(e) => {
          onOn(e.target.checked);
        }}
      />
      <input
        className={`h-9 min-w-0 flex-1 ${INPUT} ${strong === true ? 'font-semibold' : ''} ${on ? '' : 'text-ink-3'}`}
        aria-label={`Name of ${name}`}
        maxLength={FORM_SETUP_LIMITS.label}
        placeholder={standard}
        value={typed ?? name}
        disabled={disabled}
        data-testid={`${testId}-name`}
        onChange={(e) => {
          setTyped(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <Button
        variant="quiet"
        size="sm"
        icon={ArrowUp}
        aria-label={`Move ${name} up`}
        disabled={disabled || !canUp}
        data-testid={`${testId}-up`}
        onClick={() => {
          onMove(-1);
        }}
      />
      <Button
        variant="quiet"
        size="sm"
        icon={ArrowDown}
        aria-label={`Move ${name} down`}
        disabled={disabled || !canDown}
        data-testid={`${testId}-down`}
        onClick={() => {
          onMove(1);
        }}
      />
      {onRemove ? (
        <Button variant="quiet" size="sm" icon={X} aria-label={`Remove ${name}`} disabled={disabled} data-testid={`${testId}-remove`} onClick={onRemove} />
      ) : (
        <span className="w-8 shrink-0" />
      )}
    </li>
  );
}

interface AddEntryProps {
  /** "Add field" or "Add column". */
  label: string;
  /** A field is short or long; a column is always short. */
  kinds: boolean;
  disabled: boolean;
  testId: string;
  /** `done` runs once it is on the form (the box then closes). */
  onAdd: (name: string, long: boolean, done: () => void) => void;
}

export function AddEntry({ label, kinds, disabled, testId, onAdd }: AddEntryProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'short' | 'long'>('short');

  function add() {
    const text = name.trim();
    if (text === '') return;
    onAdd(text, kind === 'long', () => {
      setOpen(false);
      setName('');
      setKind('short');
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        icon={Plus}
        className="self-start"
        disabled={disabled}
        data-testid={testId}
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className={`h-9 min-w-0 flex-1 basis-40 ${INPUT}`}
        aria-label={`${label}: name`}
        placeholder="Name"
        autoFocus
        maxLength={FORM_SETUP_LIMITS.label}
        value={name}
        data-testid={`${testId}-name`}
        onChange={(e) => {
          setName(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
        }}
      />
      {kinds ? (
        <ChipPick
          label="Size"
          chips={KINDS}
          picked={[kind]}
          testId={`${testId}-kind`}
          onChange={(picked) => {
            setKind(picked[0] ?? kind);
          }}
        />
      ) : null}
      <Button size="sm" variant="primary" disabled={disabled || name.trim() === ''} data-testid={`${testId}-go`} onClick={add}>
        Add
      </Button>
      <Button
        variant="quiet"
        size="sm"
        icon={X}
        aria-label="Cancel"
        onClick={() => {
          setOpen(false);
          setName('');
        }}
      />
    </div>
  );
}
