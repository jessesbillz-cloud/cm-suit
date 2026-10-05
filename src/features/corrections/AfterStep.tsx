// What stays on the item after my own step, for as long as the database allows it (15 minutes, undo_correction): Undo
// (a new item goes away; a step goes back), and after a one-tap Corrected / Sign off / Reopen, a note added after
// (correction_step_note, once). Not only in the 5-second toast.
import { useState } from 'react';
import { MessageSquarePlus, Undo2 } from 'lucide-react';
import { useCorrectionStepNote, useUndoCorrection } from '../../data/corrections.mutations';
import type { CorrectionHistoryRow, CorrectionRow } from '../../data/corrections.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_LABEL } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { useBefore } from '../../ui/useBefore';
import { UNDO_MS, cnLabel, undoableStep } from './model';
import { useCorrectionsNav } from './useCorrectionsNav';

interface NoteFormProps {
  row: CorrectionRow;
  onDone: () => void;
}

function NoteForm({ row, onDone }: NoteFormProps) {
  const add = useCorrectionStepNote();
  const [note, setNote] = useState('');
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-line p-3.5"
      data-testid="cn-note-form"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate({ row, note }, { onSuccess: onDone });
      }}
    >
      <label className={FIELD_LABEL}>
        Note
        <textarea
          rows={3}
          autoFocus
          maxLength={4000}
          className={FIELD_AREA}
          value={note}
          data-testid="cn-note-text"
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </label>
      {add.isError ? (
        <p role="alert" className="text-sm text-danger">
          {messageOf(add.error)}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={add.isPending} disabled={note.trim() === ''} data-testid="cn-note-save">
          Save
        </Button>
      </div>
    </form>
  );
}

interface AfterStepProps {
  row: CorrectionRow;
  history: readonly CorrectionHistoryRow[];
  userId: string;
}

export function AfterStep({ row, history, userId }: AfterStepProps) {
  const undo = useUndoCorrection();
  const toast = useToast();
  const nav = useCorrectionsNav(row.project_id, row.id);
  const [noting, setNoting] = useState(false);
  const last = undoableStep(history, userId, Date.now());
  const open = useBefore(last ? Date.parse(last.created_at) + UNDO_MS : null);
  if (!last || !open) return null;
  if (noting) {
    return (
      <NoteForm
        row={row}
        onDone={() => {
          setNoting(false);
        }}
      />
    );
  }
  const noteable = last.action !== 'created' && last.note === '';

  return (
    <div className="flex flex-wrap gap-2" data-testid="cn-after-step">
      {noteable ? (
        <Button
          size="sm"
          variant="quiet"
          icon={MessageSquarePlus}
          data-testid="cn-add-note"
          onClick={() => {
            setNoting(true);
          }}
        >
          Add note
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="quiet"
        icon={Undo2}
        loading={undo.isPending}
        data-testid="cn-undo"
        onClick={() => {
          undo.mutate(row, {
            onSuccess: ({ removed }) => {
              toast.show({ message: `${cnLabel(row.number)} ${removed ? 'removed' : 'undone'}` });
              if (removed) nav.close();
            },
            onError: (e) => {
              toast.show({ tone: 'error', message: `Could not undo: ${messageOf(e)}` });
            },
          });
        }}
      >
        Undo
      </Button>
    </div>
  );
}
