// A board line about a correction: CN number, title, status, trade and location, its first photo, View (all its photos
// full screen, arrows between them) and Open.
import { useCorrections, usePhotoFiles } from '../../../data/corrections.queries';
import { usePreviewFetch } from '../../../data/preview';
import { useFileViewer } from '../../../ui/FileViewer';
import { ErrorState, LoadingState } from '../../../ui/States';
import { StatusChip } from '../../../ui/StatusChip';
import { cnLabel, statusChip } from '../../corrections/model';
import { PhotoStrip } from '../../corrections/PhotoStrip';
import { fileViewerItem } from '../../files/viewerItems';
import { EntityPane, Facts, type KindProps } from '../EntityPane';

export function CorrectionEntity({ frame, id }: KindProps) {
  // The log the corrections tool reads (one cache): opening the item there is instant.
  const list = useCorrections(frame.projectId);
  const row = list.data?.find((r) => r.id === id);
  const photos = usePhotoFiles(frame.projectId, row?.photo_ids ?? []);
  const viewer = useFileViewer();
  const preview = usePreviewFetch();

  if (list.isPending) return <LoadingState label="Loading the correction" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (!row) return <EntityPane frame={{ ...frame, open: null }} label="Correction" title="This correction isn't here." />;

  const chip = statusChip(row.status);
  const photo = row.photo_ids.slice(0, 1);
  const shown = photos.data ?? [];
  return (
    <EntityPane
      frame={frame}
      label={cnLabel(row.number)}
      title={row.title}
      view={
        shown.length > 0
          ? () => {
              viewer.open(shown.map((f) => fileViewerItem(f, preview)));
            }
          : undefined
      }
    >
      <Facts
        rows={[
          ['Status', <StatusChip key="status" status={chip.status} label={chip.label} />],
          ['Trade', row.trade],
          ['Location', row.location],
        ]}
      />
      {photo.length > 0 ? <PhotoStrip projectId={frame.projectId} ids={photo} timeZone={frame.zone} /> : null}
    </EntityPane>
  );
}
