// The board: the three-week grid on top, the picked day's cards below. Presentational; the app and the public link
// each load the three weeks and hand them in.
import { formatDay } from '../../lib/dates';
import { byTime, countByDay, shiftDay, threeWeekDays } from '../../lib/deliveries';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { DeliveryCard, type CardDelivery } from './DeliveryCard';
import { ThreeWeekGrid } from './ThreeWeekGrid';

interface BoardProps {
  tz: string;
  today: string;
  /** The picked day; the three weeks start with its week. */
  day: string;
  rows: readonly CardDelivery[] | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  onPickDay: (day: string) => void;
  /** Opens a delivery (app only). */
  onOpen?: ((id: string) => void) | undefined;
}

/** The three weeks the board shows for a picked day. */
export function boardWindow(day: string): { days: string[]; from: string; to: string } {
  const days = threeWeekDays(day);
  return { days, from: days[0] ?? day, to: days[days.length - 1] ?? day };
}

export function Board({ tz, today, day, rows, isPending, error, onRetry, onPickDay, onOpen }: BoardProps) {
  const { days } = boardWindow(day);
  const counts = countByDay(rows ?? []);
  const dayRows = (rows ?? []).filter((r) => r.delivery_date === day).sort(byTime);

  return (
    <div className="flex flex-col gap-4">
      <ThreeWeekGrid
        days={days}
        counts={counts}
        today={today}
        selected={day}
        onPick={onPickDay}
        onShift={(weeks) => {
          onPickDay(shiftDay(day, weeks * 7));
        }}
        onToday={() => {
          onPickDay(today);
        }}
      />
      <section aria-label="Day" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">{formatDay(day, 'EEEE, MMM d')}</h3>
        {isPending ? <LoadingState label="Loading deliveries" /> : null}
        {!isPending && error !== null ? <ErrorState error={error} onRetry={onRetry} /> : null}
        {!isPending && error === null && dayRows.length === 0 ? <EmptyState title="No deliveries this day." /> : null}
        {dayRows.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="delivery-day-cards">
            {dayRows.map((r) => (
              <DeliveryCard
                key={r.id ?? r.number}
                delivery={r}
                tz={tz}
                onOpen={
                  onOpen && r.id !== undefined
                    ? () => {
                        if (r.id !== undefined) onOpen(r.id);
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
