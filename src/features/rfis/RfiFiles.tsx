// An RFI's photos or answer files: one tile each; one click downloads the original through the rfis edge function
// (a fresh signed URL, the original filename, logged). Photo tiles show the picture (ui/Thumb, opened through the RFI);
// files are a line each.
import { LoaderCircle } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useRfiDownload } from '../../data/rfis.mutations';
import type { RfiFileRef } from '../../data/rfis.types';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { PHOTO_GRID, PHOTO_TILE, Thumb } from '../../ui/Thumb';
import { useToast } from '../../ui/Toast';

interface RfiFilesProps {
  rfiId: string;
  files: readonly RfiFileRef[];
  kind: 'photos' | 'files';
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
              className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-line bg-card px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft/60"
              onClick={() => {
                get(f.id);
              }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-page text-ink-2">
                <Icon
                  icon={pending === f.id ? LoaderCircle : fileIcon(f.original_name, f.mime)}
                  size={16}
                  className={pending === f.id ? 'animate-spin' : ''}
                />
              </span>
              <span className="min-w-0 flex-1 break-words">{f.original_name}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={PHOTO_GRID} aria-label="Photos">
      {files.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            title={f.original_name}
            aria-label={`Download ${f.original_name}`}
            className={PHOTO_TILE}
            onClick={() => {
              get(f.id);
            }}
          >
            <Thumb fileId={f.id} via={{ rfiId }} alt={f.original_name} fill />
            {pending === f.id ? (
              <span className="absolute inset-0 flex items-center justify-center bg-card/60">
                <Icon icon={LoaderCircle} size={20} className="animate-spin text-ink-2" label="Downloading" />
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
