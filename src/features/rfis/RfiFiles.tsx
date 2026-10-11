// An RFI's photos or answer files. A tap opens the file viewer over them (a photo, a PDF's pages; arrows between them,
// Download inside), all through the RFI's own gate (the preview via the RFI; the download through the rfis edge
// function: a fresh signed URL, the original filename, logged). Photo tiles show the picture (ui/Thumb) with a
// one-click Download in the corner; files are a line each (a tap on the line opens it, the one way to enlarge it), with
// Download at the end (one click).
import { Download } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { usePreviewFetch } from '../../data/preview';
import { saveRfiFile, useRfiDownload } from '../../data/rfis.mutations';
import type { RfiFileRef } from '../../data/rfis.types';
import { fileKind } from '../../lib/fileKind';
import { Button } from '../../ui/Button';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { PhotoTile } from '../../ui/PhotoTile';
import { PHOTO_GRID } from '../../ui/Thumb';
import { useToast } from '../../ui/Toast';

interface RfiFilesProps {
  rfiId: string;
  files: readonly RfiFileRef[];
  kind: 'photos' | 'files';
}

export function RfiFiles({ rfiId, files, kind }: RfiFilesProps) {
  const download = useRfiDownload();
  const toast = useToast();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
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
  const items: ViewerItem[] = files.map((f) => ({
    id: f.id,
    name: f.original_name,
    kind: fileKind(f.original_name, f.mime),
    url: () => preview(f.id, { rfiId }),
    download: () => saveRfiFile(rfiId, f.id),
  }));

  if (kind === 'files') {
    return (
      <ul className="flex flex-col gap-1.5" aria-label="Files">
        {files.map((f, i) => (
          <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5">
            <button
              type="button"
              data-testid="rfi-file-open"
              className="flex min-h-9 min-w-0 flex-1 items-center gap-3 text-left text-sm text-ink hover:text-accent"
              onClick={() => {
                viewer.open(items, i);
              }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-page text-ink">
                <Icon icon={fileIcon(f.original_name, f.mime)} size={16} />
              </span>
              <span className="min-w-0 flex-1 break-words">{f.original_name}</span>
            </button>
            <Button
              size="sm"
              variant="quiet"
              icon={Download}
              aria-label={`Download ${f.original_name}`}
              loading={pending === f.id}
              onClick={() => {
                get(f.id);
              }}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={PHOTO_GRID} aria-label="Photos">
      {files.map((f, i) => (
        <PhotoTile
          key={f.id}
          fileId={f.id}
          via={{ rfiId }}
          name={f.original_name}
          testId="rfi-photo"
          downloading={pending === f.id}
          onOpen={() => {
            viewer.open(items, i);
          }}
          onDownload={() => {
            get(f.id);
          }}
        />
      ))}
    </ul>
  );
}
