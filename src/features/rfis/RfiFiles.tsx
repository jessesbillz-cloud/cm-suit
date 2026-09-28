// An RFI's photos or answer files: one tile each; one click downloads the original through the rfis edge function
// (a fresh signed URL, the original filename, logged). Photo tiles are square; files are a line each.
import { FileText, Image as PhotoIcon, LoaderCircle, Paperclip } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useRfiDownload } from '../../data/rfis.mutations';
import type { RfiFileRef } from '../../data/rfis.types';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';

interface RfiFilesProps {
  rfiId: string;
  files: readonly RfiFileRef[];
  kind: 'photos' | 'files';
}

function iconOf(mime: string) {
  if (mime.startsWith('image/')) return PhotoIcon;
  return mime === 'application/pdf' ? FileText : Paperclip;
}

export function RfiFiles({ rfiId, files, kind }: RfiFilesProps) {
  const download = useRfiDownload();
  const toast = useToast();
  if (files.length === 0) return null;
  const pending = download.isPending ? download.variables.fileId : null;
  const get = (fileId: string) => {
    download.mutate(
      { rfiId, fileId },
      {
        onError: (e) => {
          toast.show({ tone: 'error', message: messageOf(e) });
        },
      },
    );
  };

  if (kind === 'files') {
    return (
      <ul className="flex flex-col gap-1.5" aria-label="Files">
        {files.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              aria-label={`Download ${f.original_name}`}
              className="flex w-full items-center gap-2 rounded-md border border-line bg-card px-3 py-2 text-left text-sm text-ink hover:border-accent/40 hover:bg-accent-soft"
              onClick={() => {
                get(f.id);
              }}
            >
              <Icon icon={pending === f.id ? LoaderCircle : iconOf(f.mime)} size={16} className={pending === f.id ? 'animate-spin text-ink-2' : 'text-ink-2'} />
              <span className="min-w-0 flex-1 break-words">{f.original_name}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Photos">
      {files.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            title={f.original_name}
            aria-label={`Download ${f.original_name}`}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-line bg-page p-1 text-ink-2 hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
            onClick={() => {
              get(f.id);
            }}
          >
            <Icon icon={pending === f.id ? LoaderCircle : PhotoIcon} size={22} className={pending === f.id ? 'animate-spin' : ''} />
            <span className="w-full break-words text-center text-[11px] leading-4">{f.original_name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
