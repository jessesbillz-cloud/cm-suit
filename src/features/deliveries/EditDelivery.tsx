// Edit a delivery (its poster, or deliveries.manage). Version-checked; the database re-decides Standby when the time
// moves and keeps what changed in the history.
import { useState } from 'react';
import { useDeliveries, useDeliveryCompanies } from '../../data/deliveries.queries';
import { useUpdateDelivery } from '../../data/deliveries.mutations';
import type { DeliveryInput, DeliveryRow } from '../../data/deliveries.types';
import { messageOf } from '../../data/errors';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { headsUpFor } from './headsUp';
import { PostForm } from './PostForm';

interface EditDeliveryProps {
  projectId: string;
  row: DeliveryRow;
  tz: string;
  onDone: () => void;
}

function inputOf(row: DeliveryRow, tz: string): DeliveryInput {
  return {
    company: row.company,
    date: row.delivery_date,
    time: row.starts_at === null ? null : formatInZone(row.starts_at, tz, 'HH:mm'),
    duration_min: row.duration_min,
    description: row.description,
  };
}

export function EditDelivery({ projectId, row, tz, onDone }: EditDeliveryProps) {
  const [value, setValue] = useState<DeliveryInput>(() => inputOf(row, tz));
  const companies = useDeliveryCompanies(projectId);
  const sameDay = useDeliveries(projectId, value.date || row.delivery_date, value.date || row.delivery_date);
  const update = useUpdateDelivery(projectId);
  const toast = useToast();

  if (companies.isPending) return <LoadingState label="Opening the form" />;
  if (companies.isError) return <ErrorState error={companies.error} onRetry={() => void companies.refetch()} />;
  const headsUp = headsUpFor(sameDay.data ?? [], value, tz, row.id);

  return (
    <div className="flex flex-col gap-3">
      <PostForm
        value={value}
        onChange={setValue}
        companies={companies.data.map((c) => c.name)}
        headsUp={headsUp}
        busy={update.isPending}
        submitLabel={headsUp ? 'Save as Standby' : 'Save'}
        onSubmit={() => {
          update.mutate(
            { row, input: value },
            {
              onSuccess: () => {
                toast.show({ message: `Saved #${String(row.number)}.` });
                onDone();
              },
              onError: (e) => {
                toast.show({ tone: 'error', message: `Not saved: ${messageOf(e)}` });
              },
            },
          );
        }}
      />
      <Button variant="quiet" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}
