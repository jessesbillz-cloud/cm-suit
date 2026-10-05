// Attached files, one line each: the type icon, the name (wraps), View (the file viewer: a photo, a PDF's pages; the
// arrows walk the list) and one-click Download. Remove (drafts) takes a file off, with the caller's Undo; the viewer
// offers the same as Delete. The names come from files.
import { Download, Eye, X } from 'lucide-react';
import { useUser } from '../../data/auth';
import { usePreviewFetch } from '../../data/preview';
import { useFile, useFilesById } from '../../data/queries';
import { fileKind } from '../../lib/fileKind';
import { Button } from '../../ui/Button';
import { useFileViewer } from '../../ui/FileViewer';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { canOpenNow } from '../files/scanStatus';
import { useDownload } from '../files/useDownload';
import { fileViewerItem } from '../files/viewerItems';

interface FileLineProps {
  fileId: string;
  onView?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
}

function FileLine({ fileId, onView, onRemove }: FileLineProps) {
  const file = useFile(fileId);
  const download = useDownload();
  const name = file.data?.original_name ?? (file.isPending ? 'Loading' : 'File');
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-3 py-1.5 text-sm" data-testid="file-line">
      <Icon icon={fileIcon(name, file.data?.mime)} size={16} className="shrink-0 text-ink-2" />
      <span className="min-w-0 flex-1 break-words text-ink">{name}</span>
      {onView ? (
        <Button size="sm" variant="quiet" icon={Eye} aria-label={`View ${name}`} data-testid="file-line-view" onClick={onView}>
          View
        </Button>
      ) : null}
      <Button
        size="sm"
        icon={Download}
        aria-label={`Download ${name}`}
        loading={download.pendingId === fileId}
        onClick={() => {
          download.start(fileId, file.data?.size);
        }}
      >
        Download
      </Button>
      {onRemove ? <Button size="sm" variant="quiet" icon={X} aria-label={`Remove ${name}`} onClick={onRemove} /> : null}
    </li>
  );
}

interface FileLinesProps {
  ids: readonly string[];
  /** Drafts only: take a file off the item (Undo lives with the caller's toast). */
  onRemove?: ((fileId: string) => void) | undefined;
  className?: string | undefined;
}

export function FileLines({ ids, onRemove, className = 'flex flex-col gap-2' }: FileLinesProps) {
  const user = useUser();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const rows = useFilesById(ids);
  // What the viewer can show now: photos and PDFs, past the scan (a file still scanning opens for its uploader only).
  const items = rows
    .filter((f) => fileKind(f.original_name, f.mime) !== 'other' && canOpenNow(f, user.id))
    .map((f) =>
      fileViewerItem(
        f,
        preview,
        onRemove
          ? () => {
              onRemove(f.id);
            }
          : undefined,
      ),
    );
  if (ids.length === 0) return null;
  return (
    <ul className={className}>
      {ids.map((id) => {
        const at = items.findIndex((i) => i.id === id);
        return (
          <FileLine
            key={id}
            fileId={id}
            onView={
              at >= 0
                ? () => {
                    viewer.open(items, at);
                  }
                : undefined
            }
            onRemove={
              onRemove
                ? () => {
                    onRemove(id);
                  }
                : undefined
            }
          />
        );
      })}
    </ul>
  );
}
