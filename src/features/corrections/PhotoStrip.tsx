// Saved photos on an item or a step: one tile each, one click downloads the original (lib/saveFile via useDownload).
// Tiles show the photo's time. The picture itself appears here once the files tool serves image previews.
import { Image as PhotoIcon, LoaderCircle } from 'lucide-react';
import { usePhotoFiles } from '../../data/corrections.queries';
import { formatInZone } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { ErrorState } from '../../ui/States';
import { useDownload } from '../files/useDownload';

interface PhotoStripProps {
  projectId: string;
  ids: readonly string[];
  timeZone: string;
}

export function PhotoStrip({ projectId, ids, timeZone }: PhotoStripProps) {
  const files = usePhotoFiles(projectId, ids);
  const download = useDownload();

  if (ids.length === 0) return null;
  if (files.isPending) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-ink-2">
        <Icon icon={LoaderCircle} size={16} className="animate-spin" />
        Loading photos...
      </div>
    );
  }
  if (files.isError) return <ErrorState error={files.error} onRetry={() => void files.refetch()} title="Photos did not load." />;
  if (files.data.length === 0) return <p className="text-sm text-ink-2">Photos removed.</p>;

  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Photos">
      {files.data.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            title={f.original_name}
            aria-label={`Download ${f.original_name}`}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-line bg-page text-ink-2 hover:bg-accent-soft hover:text-accent"
            onClick={() => {
              download.start(f.id, f.size);
            }}
          >
            <Icon icon={download.pendingId === f.id ? LoaderCircle : PhotoIcon} size={22} className={download.pendingId === f.id ? 'animate-spin' : ''} />
            <span className="text-xs">{formatInZone(f.created_at, timeZone, 'MMM d, h:mm a')}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
