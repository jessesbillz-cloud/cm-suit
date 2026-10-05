// The formal notice as a file on the item: attach one (the one uploader, into Reports/Corrections: a document, not a
// photo), look at it full screen (a tap on its name), or remove it. A notice attached before 0078 stays where it was.
import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { useCorrectionNoticeUpload } from '../../data/corrections.mutations';
import { usePhotoFiles } from '../../data/corrections.queries';
import { messageOf } from '../../data/errors';
import { usePreviewFetch } from '../../data/preview';
import { Button } from '../../ui/Button';
import { useFileViewer } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { fileViewerItem } from '../files/viewerItems';

interface NoticeFileProps {
  projectId: string;
  fileId: string | null;
  onChange: (fileId: string | null) => void;
}

export function NoticeFile({ projectId, fileId, onChange }: NoticeFileProps) {
  const upload = useCorrectionNoticeUpload();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = usePhotoFiles(projectId, fileId === null ? [] : [fileId]);
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const row = file.data?.[0];
  const name = row?.original_name ?? 'Notice file';
  const item = row ? fileViewerItem(row, preview) : null;

  function attach(picked: File) {
    setBusy(true);
    setProblem(null);
    void upload(projectId, picked, new AbortController().signal)
      .then(onChange, (e: unknown) => {
        setProblem(`Not attached: ${messageOf(e)}`);
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <div className="flex flex-col gap-1">
      {fileId !== null ? (
        <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
          <Icon icon={Paperclip} size={16} className="text-ink-3" />
          {item !== null && item.kind !== 'other' ? (
            <button
              type="button"
              data-testid="cn-notice-open"
              className="min-w-0 flex-1 break-words text-left hover:text-accent"
              onClick={() => {
                viewer.open([item]);
              }}
            >
              {name}
            </button>
          ) : (
            <span className="min-w-0 flex-1 break-words">{name}</span>
          )}
          <button
            type="button"
            aria-label="Remove notice file"
            className="text-ink-2 hover:text-ink"
            onClick={() => {
              onChange(null);
            }}
          >
            <Icon icon={X} size={16} />
          </button>
        </div>
      ) : (
        <div>
          <Button
            size="sm"
            icon={Paperclip}
            loading={busy}
            onClick={() => {
              input.current?.click();
            }}
          >
            Attach notice
          </Button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        hidden
        data-testid="cn-notice-input"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (picked) attach(picked);
        }}
      />
      {problem ? <p className="text-sm text-danger">{problem}</p> : null}
    </div>
  );
}
