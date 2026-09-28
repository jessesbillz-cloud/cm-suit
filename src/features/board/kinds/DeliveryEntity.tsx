// A board line about a delivery: number, company, day and time on the job's clock, what is coming, Standby, and Open.
import { useDelivery } from '../../../data/deliveries.queries';
import { formatDay } from '../../../lib/dates';
import { ErrorState, LoadingState } from '../../../ui/States';
import { StatusChip } from '../../../ui/StatusChip';
import { StandbyChip, timeRange } from '../../deliveries/DeliveryCard';
import { EntityPane, Facts, type KindProps } from '../EntityPane';

export function DeliveryEntity({ frame, id }: KindProps) {
  const q = useDelivery(frame.projectId, id);

  if (q.isPending) return <LoadingState label="Loading the delivery" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data === null) return <EntityPane frame={{ ...frame, open: null }} label="Delivery" title="This delivery isn't here." />;

  const d = q.data;
  return (
    <EntityPane frame={frame} label={`Delivery #${String(d.number)}`} title={d.company}>
      <Facts
        rows={[
          ['When', `${formatDay(d.delivery_date, 'EEE, MMM d')} · ${timeRange(d, frame.zone)}`],
          ['What', d.description],
          d.standby ? ['Standby', <StandbyChip key="standby" />] : null,
          ['Posted by', d.posted_name],
          d.deleted_at === null ? null : ['Status', <StatusChip key="deleted" status="cancelled" label="Deleted" />],
        ]}
      />
    </EntityPane>
  );
}
