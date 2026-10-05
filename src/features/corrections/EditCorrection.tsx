// Edit an item's typed fields, its own photos (take one off, with Undo; add more with Camera / Upload) and the notice
// (the creator or an inspector; 0026 allows each). Saves carry the version it was read at.
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useCorrectionFileUpload, useSaveCorrection } from '../../data/corrections.mutations';
import { usePhotoFiles } from '../../data/corrections.queries';
import { ITEM_PHOTO_LIMIT, type CorrectionRow } from '../../data/corrections.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PHOTO_BOX, PHOTO_GRID, PHOTO_REMOVE, Thumb } from '../../ui/Thumb';
import { useToast } from '../../ui/Toast';
import { CorrectionFields, draftOf, fieldsOf, type FieldsDraft } from './CorrectionFields';
import { cnLabel } from './model';
import { NoticeFile } from './NoticeFile';
import { PhotoPicker } from './PhotoPicker';
import { usePhotoUploads } from './usePhotoUploads';

interface KeptProps {
  projectId: string;
  ids: readonly string[];
  onRemove: (id: string) => void;
}

/** The photos already on the item, each with its X. */
function KeptPhotos({ projectId, ids, onRemove }: KeptProps) {
  const files = usePhotoFiles(projectId, ids);
  if (ids.length === 0) return null;
  const nameOf = (id: string) => files.data?.find((f) => f.id === id)?.original_name ?? 'Photo';
  return (
    <ul className={PHOTO_GRID} aria-label="Photos on this item" data-testid="cn-edit-photos">
      {ids.map((id) => (
        <li key={id} className={PHOTO_BOX} data-testid="cn-kept-photo">
          <Thumb fileId={id} alt={nameOf(id)} fill />
          <button
            type="button"
            aria-label={`Remove ${nameOf(id)}`}
            className={PHOTO_REMOVE}
            onClick={() => {
              onRemove(id);
            }}
          >
            <Icon icon={X} size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface EditCorrectionProps {
  row: CorrectionRow;
  isPhone: boolean;
  onDone: () => void;
}

export function EditCorrection({ row, isPhone, onDone }: EditCorrectionProps) {
  const saveRow = useSaveCorrection();
  const toast = useToast();
  const [draft, setDraft] = useState<FieldsDraft>(() => draftOf(row));
  const [noticeFileId, setNoticeFileId] = useState<string | null>(row.notice_file_id);
  const [kept, setKept] = useState<string[]>(row.photo_ids);
  const photos = usePhotoUploads(row.project_id, Math.max(0, ITEM_PHOTO_LIMIT - kept.length), useCorrectionFileUpload());
  const [problem, setProblem] = useState<string | null>(null);

  function save() {
    const fields = fieldsOf(draft);
    if (fields.title === '') {
      setProblem('Add a title.');
      return;
    }
    setProblem(null);
    saveRow.mutate(
      { row, patch: { ...fields, notice_file_id: noticeFileId, photo_ids: [...kept, ...photos.ids] } },
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
      <KeptPhotos
        projectId={row.project_id}
        ids={kept}
        onRemove={(id) => {
          const before = kept;
          setKept(before.filter((x) => x !== id));
          toast.show({ message: 'Photo removed', action: { label: 'Undo', onClick: () => { setKept(before); } } });
        }}
      />
      <PhotoPicker uploads={photos} isPhone={isPhone} />
      <CorrectionFields value={draft} onChange={setDraft} autoFocus={!isPhone} />
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
        <Button
          type="submit"
          variant="primary"
          icon={Check}
          loading={saveRow.isPending}
          disabled={photos.busy || photos.failed}
          data-testid="cn-edit-save"
        >
          Save
        </Button>
      </div>
    </form>
  );
}
