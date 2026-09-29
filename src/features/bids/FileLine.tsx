// One attached file: its name (wraps) and one Download button. The name comes from files; the download is one click.
import { Download, X } from 'lucide-react';
import { useFile } from '../../data/queries';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useDownload } from '../files/useDownload';
import { fileIcon } from '../../ui/fileIcon';

interface FileLineProps {
  fileId: string;
  /** Drafts only: take the file off the item (Undo lives with the caller's toast). */
  onRemove?: (() => void) | undefined;
}

export function FileLine({ fileId, onRemove }: FileLineProps) {
  const file = useFile(fileId);
  const download = useDownload();
  const name = file.data?.original_name ?? (file.isPending ? 'Loading' : 'File');
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-3 py-1.5 text-sm">
      <Icon icon={fileIcon(name, file.data?.mime)} size={16} className="shrink-0 text-ink-2" />
      <span className="min-w-0 flex-1 break-words text-ink">{name}</span>
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
