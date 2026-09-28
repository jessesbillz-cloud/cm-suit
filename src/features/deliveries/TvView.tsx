// TV mode (SPEC §13.3): full screen, live clock, the screen kept awake, refreshed every 30 seconds by its caller.
// Big type, readable from across a trailer: today on the left, the next six days on the right.
import { formatDay, formatInZone, todayInZone } from '../../lib/dates';
import { byTime, shiftDay } from '../../lib/deliveries';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { DeliveryCard, StandbyChip, timeRange, type CardDelivery } from './DeliveryCard';
import { useNow, useWakeLock } from './useTvScreen';

/** How far the TV looks ahead (today + 6 days). */
export const TV_DAYS = 7;
export const TV_REFRESH_MS = 30_000;

interface TvViewProps {
  title: string;
  tz: string;
  rows: readonly CardDelivery[] | undefined;
  error: unknown;
  onExit: () => void;
}

export function TvView({ title, tz, rows, error, onExit }: TvViewProps) {
  useWakeLock();
  const now = useNow();
  const today = todayInZone(tz, now);
  const all = [...(rows ?? [])].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date) || byTime(a, b));
  const todays = all.filter((r) => r.delivery_date === today);
  const next = Array.from({ length: TV_DAYS - 1 }, (_, i) => shiftDay(today, i + 1));

  return (
    <div className="fixed inset-0 z-40 flex flex-col gap-6 overflow-hidden bg-page p-6 lg:p-10" data-testid="delivery-tv">
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="break-words text-2xl font-medium text-ink-2">{title}</p>
          <h1 className="text-5xl font-bold text-ink">Deliveries</h1>
        </div>
        <div className="text-right">
          <p className="text-6xl font-bold tabular-nums text-ink" data-testid="delivery-tv-clock">
            {formatInZone(now, tz, 'h:mm:ss a')}
          </p>
          <p className="text-2xl text-ink-2">{formatInZone(now, tz, 'EEEE, MMM d')}</p>
        </div>
      </header>
      {error !== null ? <ErrorState error={error} title="The board did not refresh." /> : null}
      {rows === undefined && error === null ? <LoadingState label="Loading deliveries" /> : null}
      <div className="grid min-h-0 flex-1 gap-8 lg:grid-cols-[3fr_2fr]">
        <section className="flex min-h-0 flex-col gap-3" aria-label="Today">
          <h2 className="text-3xl font-semibold text-ink">Today</h2>
          {rows !== undefined && todays.length === 0 ? <p className="text-2xl text-ink-2">No deliveries today.</p> : null}
          <ul className="flex flex-col gap-3 overflow-hidden">
            {todays.map((r) => (
              <DeliveryCard key={r.number} delivery={r} tz={tz} size="tv" />
            ))}
          </ul>
        </section>
        <section className="flex min-h-0 flex-col gap-3 overflow-hidden" aria-label="Next days">
          <h2 className="text-3xl font-semibold text-ink">Coming up</h2>
          {next.map((d) => {
            const list = all.filter((r) => r.delivery_date === d);
            if (list.length === 0) return null;
            return (
              <div key={d}>
                <p className="text-xl font-semibold text-ink-2">{formatDay(d, 'EEEE, MMM d')}</p>
                <ul className="flex flex-col gap-1">
                  {list.map((r) => (
                    <li key={r.number} className="flex flex-wrap items-center gap-x-3 text-xl text-ink">
                      <span className="tabular-nums text-ink-2">{timeRange(r, tz)}</span>
                      <span className="font-semibold">{r.company}</span>
                      {r.standby ? <StandbyChip /> : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>
      <div className="absolute bottom-4 right-4">
        <Button variant="quiet" onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );
}
