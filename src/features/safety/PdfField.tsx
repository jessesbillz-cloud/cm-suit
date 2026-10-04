// One PDF for a talk (an own topic, a company topic): picked from the phone or the computer and uploaded into the job's
// Safety folder through the one uploader. Shows the file's name once it is in; Remove takes it off the form (the file
// stays in the folder).
import { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSafetyUpload } from '../../data/safety.mutations';
import { isAbortError } from '../../data/upload';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

export interface PickedPdf {
  id: string;
  name: string;
}

interface PdfFieldProps {
  projectId: string;
  value: PickedPdf | null;
  onChange: (pdf: PickedPdf | null) => void;
  testId: string;
}

export function PdfField({ projectId, value, onChange, testId }: PdfFieldProps) {
  const upload = useSafetyUpload(projectId);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function take(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Pick a PDF.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await upload(file, new AbortController().signal);
      onChange({ id, name: file.name });
    } catch (e) {
      if (!isAbortError(e)) setError(messageOf(e));
      console.warn('safety pdf upload failed', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">PDF</span>
      {value ? (
        <span className="flex items-center gap-2 rounded-lg border border-line bg-card-head px-3 py-2 text-sm text-ink" data-testid={`${testId}-name`}>
          <Icon icon={FileText} size={16} className="shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 break-words">{value.name}</span>
          <Button size="sm" variant="quiet" icon={X} aria-label="Remove the PDF" onClick={() => { onChange(null); }} />
        </span>
      ) : (
        <Button icon={Upload} loading={busy} className="self-start" data-testid={`${testId}-add`} onClick={() => input.current?.click()}>
          Add PDF
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        data-testid={`${testId}-input`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void take(file);
        }}
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
