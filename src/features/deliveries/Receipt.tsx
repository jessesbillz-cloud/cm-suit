// A delivery's receipt: its number and what was posted. The same block in the app, on the link and on paper.
import { formatDay, formatInZone } from '../../lib/dates';
import { durationLabel } from '../../lib/deliveries';
import { StandbyChip, timeRange, type CardDelivery } from './DeliveryCard';

interface ReceiptBodyProps {
  delivery: CardDelivery & { posted_at?: string | undefined };
  tz: string;
}

export function ReceiptBody({ delivery: d, tz }: ReceiptBodyProps) {
  const posted = [d.posted_name, d.posted_at ? formatInZone(d.posted_at, tz, 'MMM d, h:mm a') : undefined].filter(Boolean).join(' · ');
  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm" data-testid="delivery-receipt">
      <dt className="text-ink-2">Receipt</dt>
      <dd className="font-semibold tabular-nums text-ink" data-testid="delivery-receipt-number">
        #{d.number}
      </dd>
      <dt className="text-ink-2">Company</dt>
      <dd className="break-words text-ink">{d.company}</dd>
      <dt className="text-ink-2">Date</dt>
      <dd className="text-ink">{formatDay(d.delivery_date, 'EEE, MMM d, yyyy')}</dd>
      <dt className="text-ink-2">Time</dt>
      <dd className="text-ink">{timeRange(d, tz)}</dd>
      <dt className="text-ink-2">Duration</dt>
      <dd className="text-ink">{durationLabel(d.duration_min)}</dd>
      <dt className="text-ink-2">Description</dt>
      <dd className="break-words text-ink">{d.description}</dd>
      {d.standby ? (
        <>
          <dt className="text-ink-2">Status</dt>
          <dd>
            <StandbyChip />
          </dd>
        </>
      ) : null}
      {posted ? (
        <>
          <dt className="text-ink-2">Posted by</dt>
          <dd className="break-words text-ink">{posted}</dd>
        </>
      ) : null}
    </dl>
  );
}

interface PrintedReceiptProps extends ReceiptBodyProps {
  projectName: string;
}

/** The paper receipt. */
export function PrintedReceipt({ projectName, ...rest }: PrintedReceiptProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-ink-2">{projectName}</p>
        <h1 className="text-2xl font-semibold text-ink">Delivery receipt</h1>
      </div>
      <ReceiptBody {...rest} />
    </div>
  );
}
