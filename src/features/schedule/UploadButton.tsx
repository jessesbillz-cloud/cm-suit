// The one Upload button: pick any schedule file (or take a photo on a phone); the server decides what it is (P6 XER,
// Project XML, CSV, PDF or photo), reads it into a draft and the draft's review opens. A file it can't read says what
// to send instead.
import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useScheduleUpload } from '../../data/schedule.mutations';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { UPLOAD_ACCEPT } from './model';

interface UploadButtonProps {
  projectId: string;
  onDraft: (versionId: string) => void;
}

export function UploadButton({ projectId, onDraft }: UploadButtonProps) {
  const upload = useScheduleUpload(projectId);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  // Awaited, not a per-call callback: the refresh after an upload can swap this button out (the empty screen's) first.
  async function take(file: File) {
    try {
      const draft = await upload.mutateAsync(file);
      onDraft(draft.version_id);
    } catch (e) {
      console.warn('schedule upload failed', e);
      toast.show({ message: messageOf(e), tone: 'error' });
    }
  }

  return (
    <>
      <Button
        variant="primary"
        icon={Upload}
        loading={upload.isPending}
        data-testid="schedule-upload"
        onClick={() => input.current?.click()}
      >
        {upload.isPending ? 'Reading' : 'Upload'}
      </Button>
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        data-testid="schedule-upload-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void take(file);
        }}
      />
    </>
  );
}
