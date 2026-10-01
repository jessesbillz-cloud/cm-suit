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
  /** Open in the right column: the accent tint and bar. */
  selected?: boolean | undefined;
}

/** The TV card, unchanged: big type in its own bordered box. */
function TvCard({ delivery: d, tz }: { delivery: CardDelivery; tz: string }) {
  return (
    <li data-testid="delivery-card">
      <div className="flex w-full items-start gap-3 rounded-card border border-line bg-card px-5 py-4 text-left">
        <span className="w-64 shrink-0 text-3xl font-semibold tabular-nums text-ink">{timeRange(d, tz)}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-3xl font-semibold text-ink">{d.company}</span>
          <span className="block break-words text-2xl text-ink-2">{d.description}</span>
        </span>
        {d.standby ? <StandbyChip /> : null}
      </div>
    </li>
  );
}

export function DeliveryCard({ delivery: d, tz, size = 'normal', onOpen, selected = false }: DeliveryCardProps) {
  if (size === 'tv') return <TvCard delivery={d} tz={tz} />;
  const meta = [durationLabel(d.duration_min), `#${String(d.number)}`, d.posted_name].filter(Boolean).join(' · ');
  const tbd = d.starts_at === null;
  const body = (
    <>
      <span className={`w-[7.5rem] shrink-0 pt-px text-sm font-semibold tabular-nums sm:w-36 ${tbd ? 'text-ink-3' : 'text-ink'}`}>{timeRange(d, tz)}</span>
      {/* Two tight lines: the company and what is coming, then length, number and who posted it. */}
      <span className="min-w-0 flex-1 wrap-anywhere">
        <span className="block text-sm">
          <span className="font-semibold text-ink">{d.company}</span>
          {d.description !== '' ? <span className="text-ink-2"> · {d.description}</span> : null}
        </span>
        <span className="mt-0.5 block text-xs tabular-nums text-ink-3">{meta}</span>
      </span>
      {d.standby ? (
        <span className="shrink-0">
          <StandbyChip />
        </span>
      ) : null}
    </>
  );
  const cls = 'flex min-h-[52px] w-full items-start gap-3 px-4 py-3 text-left';
  return (
    <li data-testid="delivery-card">
      {onOpen ? (
        <button
          type="button"
          aria-current={selected ? 'true' : undefined}
          className={`${cls} transition-colors ${selected ? 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]' : 'hover:bg-page/60'}`}
          onClick={onOpen}
        >
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
