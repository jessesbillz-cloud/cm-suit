// A board line about a correction: CN number, title, status, trade and location, its first photo, and Open.
import { useCorrections } from '../../../data/corrections.queries';
import { ErrorState, LoadingState } from '../../../ui/States';
import { StatusChip } from '../../../ui/StatusChip';
import { cnLabel, statusChip } from '../../corrections/model';
import { PhotoStrip } from '../../corrections/PhotoStrip';
import { EntityPane, Facts, type KindProps } from '../EntityPane';

export function CorrectionEntity({ frame, id }: KindProps) {
  // The log the corrections tool reads (one cache): opening the item there is instant.
  const list = useCorrections(frame.projectId);

  if (list.isPending) return <LoadingState label="Loading the correction" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  const row = list.data.find((r) => r.id === id);
  if (!row) return <EntityPane frame={{ ...frame, open: null }} label="Correction" title="This correction isn't here." />;

  const chip = statusChip(row.status);
  const photo = row.photo_ids.slice(0, 1);
  return (
    <EntityPane frame={frame} label={cnLabel(row.number)} title={row.title}>
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
