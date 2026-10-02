// Photos or PDFs on a request sent with no login: picked on the phone, kept here until Request sends them with the form
// (photos are compressed then, through the one compressor). 3 at most; a PDF over 10 MB is refused here already.
import { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Paperclip, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

const MAX_PUBLIC_FILES = 3;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

interface PublicFilesProps {
  files: readonly File[];
  onChange: (files: File[]) => void;
}

export function PublicFiles({ files, onChange }: PublicFilesProps) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function picked(list: FileList | null) {
    const chosen = list ? Array.from(list) : [];
    if (input.current) input.current.value = '';
    if (chosen.length === 0) return;
    const usable = chosen.filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
    const sized = usable.filter((f) => f.type !== 'application/pdf' || f.size <= MAX_PDF_BYTES);
    const next = [...files, ...sized].slice(0, MAX_PUBLIC_FILES);
    setProblem(
      usable.length < chosen.length
        ? 'Photos or PDFs only.'
        : sized.length < usable.length
          ? 'PDFs must be 10 MB or less.'
          : files.length + sized.length > MAX_PUBLIC_FILES
            ? 'Up to 3.'
            : null,
    );
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/*,application/pdf"
        data-testid="public-files-input"
        onChange={(e) => {
          picked(e.target.files);
        }}
      />
      <Button
        size="lg"
        icon={Paperclip}
        className="w-full"
        disabled={files.length >= MAX_PUBLIC_FILES}
        onClick={() => {
          input.current?.click();
        }}
      >
        {files.length === 0 ? 'Photos or PDFs' : `Photos or PDFs (${String(files.length)} of 3)`}
      </Button>
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Photos or PDFs" data-testid="public-files">
          {files.map((f, i) => (
            <li key={`${f.name}-${String(i)}`} className="flex min-h-11 items-center gap-2 rounded-md border border-line px-2.5 text-sm">
              <Icon icon={f.type === 'application/pdf' ? FileText : ImageIcon} size={16} className="shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 break-words text-ink">{f.name}</span>
              <Button
                variant="quiet"
                icon={X}
                aria-label={`Remove ${f.name}`}
                onClick={() => {
                  setProblem(null);
                  onChange(files.filter((_, j) => j !== i));
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
