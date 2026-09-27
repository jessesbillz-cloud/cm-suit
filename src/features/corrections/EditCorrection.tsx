// Edit an item's typed fields and notice (the creator or an inspector). Saves carry the version it was read at.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useSaveCorrection } from '../../data/corrections.mutations';
import type { CorrectionRow } from '../../data/corrections.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { CorrectionFields, draftOf, fieldsOf, type FieldsDraft } from './CorrectionFields';
import { cnLabel } from './model';
import { NoticeFile } from './NoticeFile';

interface EditCorrectionProps {
  row: CorrectionRow;
  onDone: () => void;
}

export function EditCorrection({ row, onDone }: EditCorrectionProps) {
  const saveRow = useSaveCorrection();
  const toast = useToast();
  const [draft, setDraft] = useState<FieldsDraft>(() => draftOf(row));
  const [noticeFileId, setNoticeFileId] = useState<string | null>(row.notice_file_id);
  const [problem, setProblem] = useState<string | null>(null);

  function save() {
    const fields = fieldsOf(draft);
    if (fields.title === '') {
      setProblem('Add a title.');
      return;
    }
    setProblem(null);
    saveRow.mutate(
      { row, patch: { ...fields, notice_file_id: noticeFileId } },
      {
        onSuccess: (saved) => {
          toast.show({ message: `${cnLabel(saved.number)} saved` });
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
      className="flex flex-col gap-3"
      data-testid="cn-edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <CorrectionFields value={draft} onChange={setDraft} autoFocus />
      <NoticeFile projectId={row.project_id} fileId={noticeFileId} onChange={setNoticeFileId} />
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" icon={Check} loading={saveRow.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
