// One delivery on the board: time, company, what is coming, Standby. The same card on the app board, the link board
// and the TV (size="tv", readable from across a trailer).
import { formatInZone } from '../../lib/dates';
import { durationLabel, endMs } from '../../lib/deliveries';
import { StatusChip } from '../../ui/StatusChip';
import type { BoardDelivery } from '../../data/deliveries.types';

export interface CardDelivery extends BoardDelivery {
  /** Present in the app (opens the delivery); absent on the public link. */
  id?: string | undefined;
  posted_name?: string | undefined;
}

/** "7:00–8:00 AM", or "Time TBD". Shown on the job's clock. */
export function timeRange(d: Pick<BoardDelivery, 'starts_at' | 'duration_min'>, tz: string): string {
  if (d.starts_at === null) return 'Time TBD';
  const end = new Date(endMs(d.starts_at, d.duration_min));
  const startMeridiem = formatInZone(d.starts_at, tz, 'a');
  const endMeridiem = formatInZone(end, tz, 'a');
  const start = formatInZone(d.starts_at, tz, startMeridiem === endMeridiem ? 'h:mm' : 'h:mm a');
  return `${start}–${formatInZone(end, tz, 'h:mm a')}`;
}

export function StandbyChip() {
  return <StatusChip status="pending" label="Standby" />;
}

interface DeliveryCardProps {
  delivery: CardDelivery;
  tz: string;
  size?: 'normal' | 'tv' | undefined;
  onOpen?: (() => void) | undefined;
}

export function DeliveryCard({ delivery: d, tz, size = 'normal', onOpen }: DeliveryCardProps) {
  const tv = size === 'tv';
  const meta = [durationLabel(d.duration_min), `#${String(d.number)}`, d.posted_name].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className={`shrink-0 font-semibold tabular-nums text-ink ${tv ? 'w-64 text-3xl' : 'w-32 text-sm'}`}>{timeRange(d, tz)}</span>
      <span className="min-w-0 flex-1">
        <span className={`block break-words font-semibold text-ink ${tv ? 'text-3xl' : 'text-sm'}`}>{d.company}</span>
        <span className={`block break-words text-ink-2 ${tv ? 'text-2xl' : 'text-sm'}`}>{d.description}</span>
        {tv ? null : <span className="block text-xs text-ink-3">{meta}</span>}
      </span>
      {d.standby ? <StandbyChip /> : null}
    </>
  );
  const cls = `flex w-full items-start gap-3 rounded-card border border-line bg-card text-left ${tv ? 'px-5 py-4' : 'px-3 py-2'}`;
  return (
    <li data-testid="delivery-card">
      {onOpen ? (
        <button type="button" className={`${cls} hover:bg-page`} onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
