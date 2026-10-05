// The architect answers in the app: the answer, and files if they help (a photo, a sketch, a marked-up sheet as a PDF).
// The shared picker (Camera on the phone, Upload, thumbnails, Retry on a failed upload) sends each file at once through
// the one uploader (photos compressed first) into the job's RFIs folder.
import { useState } from 'react';
import { Send } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useAnswerRfi, useRfiUpload } from '../../data/rfis.mutations';
import { RFI_PHOTO_LIMIT, type RfiRow } from '../../data/rfis.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { PhotoPicker } from '../corrections/PhotoPicker';
import { usePhotoUploads } from '../corrections/usePhotoUploads';
import { NoteField } from './NoteForm';

interface AnswerFormProps {
  row: RfiRow;
  isPhone: boolean;
  onDone: () => void;
}

export function AnswerForm({ row, isPhone, onDone }: AnswerFormProps) {
  const answer = useAnswerRfi();
  const files = usePhotoUploads(row.project_id, RFI_PHOTO_LIMIT, useRfiUpload());
  const toast = useToast();
  const [text, setText] = useState('');

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3.5" data-testid="rfi-answer-form">
      <NoteField label="Answer" value={text} onChange={setText} testId="rfi-answer-text" rows={6} autoFocus={!isPhone} />
      <PhotoPicker uploads={files} isPhone={isPhone} inputTestId="rfi-answer-files" accept="image/*,application/pdf" />
      {answer.isError ? <p className="text-sm text-danger">{messageOf(answer.error)}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={Send}
          loading={answer.isPending}
          disabled={text.trim() === '' || files.busy || files.failed}
          data-testid="rfi-answer-send"
          onClick={() => {
            answer.mutate(
              { ref: row, answer: text, fileIds: files.ids },
              {
                onSuccess: () => {
                  toast.show({ message: 'Answer sent' });
                  onDone();
                },
              },
            );
          }}
        >
          Send answer
        </Button>
      </div>
    </div>
  );
}
