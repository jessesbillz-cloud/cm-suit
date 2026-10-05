// Saved photos on an item or a step: one tile each showing the picture (ui/Thumb) and the time it was added. A tap opens
// the file viewer over the strip (arrows between them, Download inside); the corner downloads the original in one click.
import { LoaderCircle } from 'lucide-react';
import { usePhotoFiles } from '../../data/corrections.queries';
import { usePreviewFetch } from '../../data/preview';
import { formatInZone } from '../../lib/dates';
import { useFileViewer } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { PhotoTile } from '../../ui/PhotoTile';
import { ErrorState } from '../../ui/States';
import { PHOTO_GRID } from '../../ui/Thumb';
import { fileViewerItem } from '../files/viewerItems';
import { useDownload } from '../files/useDownload';

interface PhotoStripProps {
  projectId: string;
  ids: readonly string[];
  timeZone: string;
}

export function PhotoStrip({ projectId, ids, timeZone }: PhotoStripProps) {
  const files = usePhotoFiles(projectId, ids);
  const download = useDownload();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();

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

  const items = files.data.map((f) => fileViewerItem(f, preview));
  return (
    <ul className={PHOTO_GRID} aria-label="Photos">
      {files.data.map((f, i) => (
        <PhotoTile
          key={f.id}
          fileId={f.id}
          name={f.original_name}
          testId="cn-photo"
          downloading={download.pendingId === f.id}
          onOpen={() => {
            viewer.open(items, i);
          }}
          onDownload={() => {
            download.start(f.id, f.size);
          }}
          label={
            <>
              <span className="block">{formatInZone(f.created_at, timeZone, 'MMM d')}</span>
              <span className="block">{formatInZone(f.created_at, timeZone, 'h:mm a')}</span>
            </>
          }
        />
      ))}
    </ul>
  );
}
