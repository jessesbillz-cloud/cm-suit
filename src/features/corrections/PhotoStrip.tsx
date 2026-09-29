// Saved photos on an item or a step: one tile each showing the picture (ui/Thumb) and the time it was added; one click
// downloads the original (lib/saveFile via useDownload).
import { LoaderCircle } from 'lucide-react';
import { usePhotoFiles } from '../../data/corrections.queries';
import { formatInZone } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { ErrorState } from '../../ui/States';
import { PHOTO_GRID, PHOTO_TILE, PHOTO_TILE_LABEL, Thumb } from '../../ui/Thumb';
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
    <ul className={PHOTO_GRID} aria-label="Photos">
      {files.data.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            title={f.original_name}
            aria-label={`Download ${f.original_name}`}
            className={PHOTO_TILE}
            onClick={() => {
              download.start(f.id, f.size);
            }}
          >
            <Thumb fileId={f.id} alt={f.original_name} fill />
            <span className={PHOTO_TILE_LABEL}>
              <span className="block">{formatInZone(f.created_at, timeZone, 'MMM d')}</span>
              <span className="block">{formatInZone(f.created_at, timeZone, 'h:mm a')}</span>
            </span>
            {download.pendingId === f.id ? (
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
