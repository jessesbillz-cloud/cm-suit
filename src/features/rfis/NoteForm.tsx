// A note box, and the small inline form for a move that needs one (send back, void): the note, the move's own button
// and Cancel. The button stays off until there is a note.
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_LABEL } from '../../ui/Fields';

const AREA = FIELD_AREA;

interface NoteFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  rows?: number | undefined;
  autoFocus?: boolean | undefined;
}

export function NoteField({ label, value, onChange, testId, rows = 3, autoFocus = false }: NoteFieldProps) {
  return (
    <label className={FIELD_LABEL}>
      {label}
      <textarea
        rows={rows}
        maxLength={4000}
        autoFocus={autoFocus}
        className={AREA}
        value={value}
        data-testid={testId}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

interface NoteFormProps {
  label: string;
  confirm: string;
  testId: string;
  icon?: LucideIcon | undefined;
  danger?: boolean | undefined;
  pending: boolean;
  error: unknown;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

export function NoteForm({ label, confirm, testId, icon, danger = false, pending, error, onConfirm, onCancel }: NoteFormProps) {
  const [note, setNote] = useState('');
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid={`${testId}-form`}>
      <NoteField label={label} value={note} onChange={setNote} testId={`${testId}-note`} autoFocus />
      {error ? <p className="text-sm text-danger">{messageOf(error)}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          icon={icon}
          loading={pending}
          disabled={note.trim() === ''}
          data-testid={`${testId}-confirm`}
          onClick={() => {
            onConfirm(note);
          }}
        >
          {confirm}
        </Button>
      </div>
    </div>
  );
}
