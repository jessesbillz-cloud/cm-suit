// A new correction: photos first (on the phone the camera has already opened), then title, trade and location,
// prefilled from my latest item. The database numbers it; a repeated save returns the same item (request key).
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useCorrectionFileUpload, useCreateCorrection } from '../../data/corrections.mutations';
import { useCorrections } from '../../data/corrections.queries';
import { ITEM_PHOTO_LIMIT, type CorrectionRow } from '../../data/corrections.types';
import { useUser } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { CorrectionFields, fieldsOf, type FieldsDraft } from './CorrectionFields';
import { cnLabel, prefill } from './model';
import { NoticeFile } from './NoticeFile';
import { PhotoPicker } from './PhotoPicker';
import { usePhotoUploads } from './usePhotoUploads';
import { useUndoOffer } from './useUndoOffer';

interface NewCorrectionProps {
  projectId: string;
  isPhone: boolean;
  /** Photos taken before the form opened (phone: New goes straight to the camera). */
  initialFiles: readonly File[];
  onCreated: (row: CorrectionRow) => void;
  onCancel: () => void;
}

export function NewCorrection({ projectId, isPhone, initialFiles, onCreated, onCancel }: NewCorrectionProps) {
  const user = useUser();
  const list = useCorrections(projectId);
  const create = useCreateCorrection();
  const offerUndo = useUndoOffer(projectId, null);
  const photos = usePhotoUploads(projectId, ITEM_PHOTO_LIMIT, useCorrectionFileUpload());
  const [requestKey] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<FieldsDraft>(() => ({
    title: '',
    description: '',
    tags: '',
    noticeRef: '',
    ...prefill(list.data ?? [], user.id),
  }));
  const [noticeFileId, setNoticeFileId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // The camera's shots go up once, even when React runs this effect twice in development.
  const seeded = useRef(false);
  const { add } = photos;
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (initialFiles.length > 0) add([...initialFiles]);
  }, [add, initialFiles]);

  function save() {
    const fields = fieldsOf(draft);
    if (fields.title === '') {
      setProblem('Add a title.');
      return;
    }
    setProblem(null);
    create.mutate(
      { projectId, requestKey, photoIds: photos.ids, noticeFileId, ...fields },
      {
        onSuccess: (row) => {
          offerUndo(row, `${cnLabel(row.number)} opened`);
          onCreated(row);
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-4 p-5"
      data-testid="cn-new-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h1 className="text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">New correction</h1>
      <PhotoPicker uploads={photos} isPhone={isPhone} />
      <CorrectionFields value={draft} onChange={setDraft} autoFocus={!isPhone || initialFiles.length > 0} />
      <NoticeFile projectId={projectId} fileId={noticeFileId} onChange={setNoticeFileId} />
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          icon={Check}
          loading={create.isPending}
          disabled={photos.busy || photos.failed}
          data-testid="cn-save"
        >
          Save
        </Button>
      </div>
    </form>
  );
}
