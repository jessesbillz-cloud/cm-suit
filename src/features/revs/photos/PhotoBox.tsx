// The Photo box of a wall, a room or a request's walls (0102): Camera on a phone (Upload too, and on a desktop), several
// at once, compressed and stored at once in the job's Wall photos (corrections' PhotoPicker and usePhotoUploads, the
// one implementation), an optional one-line note, Add. A note alone is added too. Above it, the caller's wall picker
// when the box is not one wall's. Added: the box starts empty again.
import { useState, type ReactNode } from 'react';
import { messageOf } from '../../../data/errors';
import { useAddRevPhotos, useRevPhotoUpload, type PhotoPlace } from '../../../data/revs.photos';
import { Button } from '../../../ui/Button';
import { FIELD_CONTROL } from '../../../ui/Fields';
import { PhotoPicker } from '../../corrections/PhotoPicker';
import { usePhotoUploads } from '../../corrections/usePhotoUploads';

/** Photos picked together at most. */
const LIMIT = 12;

interface FormProps {
  projectId: string;
  isPhone: boolean;
  /** Where they go; null until a wall is picked. */
  place: PhotoPlace | null;
  onDone: () => void;
}

function PhotoForm({ projectId, isPhone, place, onDone }: FormProps) {
  const uploads = usePhotoUploads(projectId, LIMIT, useRevPhotoUpload());
  const add = useAddRevPhotos();
  const [note, setNote] = useState('');
  const some = uploads.ids.length > 0 || note.trim() !== '';
  const ready = place !== null && some && !uploads.busy && !uploads.failed && !add.isPending;

  function save() {
    if (!ready || place === null) return;
    add.mutate({ projectId, at: place, fileIds: uploads.ids, note }, { onSuccess: onDone });
  }

  return (
    <div className="flex flex-col gap-2">
      <PhotoPicker uploads={uploads} isPhone={isPhone} inputTestId="rev-photo-input" />
      <div className="flex gap-2">
        <input
          className={`${FIELD_CONTROL} min-w-0 flex-1`}
          value={note}
          maxLength={200}
          placeholder="Note"
          aria-label="Note"
          data-testid="rev-photo-note"
          onChange={(e) => {
            setNote(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
        />
        <Button variant="primary" disabled={!ready} loading={add.isPending} data-testid="rev-photo-save" onClick={save}>
          Add
        </Button>
      </div>
      {add.isError ? <p className="text-sm text-danger">{messageOf(add.error)}</p> : null}
    </div>
  );
}

interface PhotoBoxProps {
  projectId: string;
  isPhone: boolean;
  place: PhotoPlace | null;
  /** The walls to pick from (a room's, a request's), above the buttons. */
  picker?: ReactNode | undefined;
}

export function PhotoBox({ projectId, isPhone, place, picker }: PhotoBoxProps) {
  // A new round after each Add: the picked photos and the note start empty.
  const [round, setRound] = useState(0);
  return (
    <div className="flex flex-col gap-2" data-testid="rev-photo-box">
      {picker}
      <PhotoForm
        key={round}
        projectId={projectId}
        isPhone={isPhone}
        place={place}
        onDone={() => {
          setRound((n) => n + 1);
        }}
      />
    </div>
  );
}
