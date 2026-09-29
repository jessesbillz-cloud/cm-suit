// One step on an item: mark ready (GC or sub) or the inspector's decision, with a note and up to 6 photos.
// Undo in the toast afterwards, never "are you sure?".
import { useState } from 'react';
import { useCorrectionFileUpload, useCorrectionStep } from '../../data/corrections.mutations';
import { STEP_PHOTO_LIMIT, type CorrectionRow, type CorrectionStep } from '../../data/corrections.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_LABEL } from '../../ui/Fields';
import { STEP_LABELS, stepDone } from './model';
import { PhotoPicker } from './PhotoPicker';
import { usePhotoUploads } from './usePhotoUploads';
import { useUndoOffer } from './useUndoOffer';

interface StepFormProps {
  row: CorrectionRow;
  step: CorrectionStep;
  isPhone: boolean;
  onDone: () => void;
}

const AREA = FIELD_AREA;

export function StepForm({ row, step, isPhone, onDone }: StepFormProps) {
  const move = useCorrectionStep();
  const offerUndo = useUndoOffer(row.project_id, row.id);
  const photos = usePhotoUploads(row.project_id, STEP_PHOTO_LIMIT, useCorrectionFileUpload());
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function confirm() {
    setProblem(null);
    move.mutate(
      { row, status: step, note: note.trim(), photoIds: photos.ids },
      {
        onSuccess: (saved) => {
          offerUndo(saved, stepDone(step, saved.number));
          onDone();
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-line p-3.5"
      data-testid="cn-step-form"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
    >
      <label className={FIELD_LABEL}>
        Note
        <textarea
          rows={3}
          autoFocus={!isPhone}
          className={AREA}
          value={note}
          data-testid="cn-step-note"
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </label>
      <PhotoPicker uploads={photos} isPhone={isPhone} />
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={move.isPending}
          disabled={photos.busy || photos.failed}
          data-testid="cn-step-confirm"
        >
          {STEP_LABELS[step]}
        </Button>
      </div>
    </form>
  );
}
