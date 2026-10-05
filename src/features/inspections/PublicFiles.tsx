// Photos or PDFs on a request sent with no login: picked on the phone, kept here until Request sends them with the form
// (photos are compressed then, through the one compressor). 3 at most; a PDF over 10 MB is refused here already. A photo
// shows as a small picture from the phone's own copy (a local object URL, nothing uploaded); a tap opens it full screen.
import { useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { saveFile } from '../../lib/saveFile';
import { Button } from '../../ui/Button';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';

const MAX_PUBLIC_FILES = 3;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

interface PublicFilesProps {
  files: readonly File[];
  onChange: (files: File[]) => void;
}

/** A local URL for each picked photo (null for a PDF), let go when the list changes or the form goes. */
function useLocalUrls(files: readonly File[]): (string | null)[] {
  const [urls, setUrls] = useState<{ files: readonly File[]; urls: (string | null)[] }>({ files: [], urls: [] });
  useEffect(() => {
    const made = files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null));
    setUrls({ files, urls: made });
    return () => {
      for (const u of made) if (u !== null) URL.revokeObjectURL(u);
    };
  }, [files]);
  return urls.files === files ? urls.urls : files.map(() => null);
}

export function PublicFiles({ files, onChange }: PublicFilesProps) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const viewer = useFileViewer();
  const urls = useLocalUrls(files);
  const photos = files.flatMap((f, i): (ViewerItem & { index: number })[] => {
    const url = urls[i] ?? null;
    if (url === null) return [];
    return [{ index: i, id: `${f.name}-${String(i)}`, name: f.name, kind: 'image', url: () => Promise.resolve(url), download: () => saveFile(f, f.name) }];
  });

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
            <li key={`${f.name}-${String(i)}`} className="flex min-h-11 items-center gap-2 rounded-md border border-line px-2.5 py-1 text-sm">
              {urls[i] ? (
                <button
                  type="button"
                  aria-label={`Open ${f.name}`}
                  data-testid="public-file-open"
                  className="h-10 w-10 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10"
                  onClick={() => {
                    viewer.open(photos, photos.findIndex((p) => p.index === i));
                  }}
                >
                  <img src={urls[i] ?? undefined} alt="" className="h-full w-full object-cover" />
                </button>
              ) : (
                <Icon icon={FileText} size={16} className="shrink-0 text-ink-3" />
              )}
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
