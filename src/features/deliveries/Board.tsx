// The board: the three-week grid on top, the picked day's deliveries below as rows with a time column. Presentational;
// the app and the public link each load the three weeks (useBoardWindow) and hand them in (inside an unpadded card).
// The grid holds still under a tapped day (MDR); only the arrows move it, or a picked day outside it (Today, a post
// for another week).
import { useState } from 'react';
import { formatDay } from '../../lib/dates';
import { byTime, countByDay, shiftDay, threeWeekDays } from '../../lib/deliveries';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { DeliveryCard, type CardDelivery } from './DeliveryCard';
import { ThreeWeekGrid } from './ThreeWeekGrid';

interface BoardProps {
  tz: string;
  today: string;
  /** The three weeks on screen (useBoardWindow). */
  days: readonly string[];
  /** The picked day. */
  day: string;
  rows: readonly CardDelivery[] | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  onPickDay: (day: string) => void;
  /** The arrows: the grid moves by whole weeks (useBoardWindow's shift). */
  onShift: (weeks: number) => void;
  /** Opens a delivery (app only). */
  onOpen?: ((id: string) => void) | undefined;
  /** The delivery open in the right column (app only). */
  selectedId?: string | null | undefined;
}

/**
 * The three weeks the board shows: they start with the picked day's week and then hold still while days inside them
 * are picked. `shift` (the arrows) moves them by whole weeks and the picked day with them, so it stays inside.
 */
export function useBoardWindow(day: string, onPickDay: (day: string) => void) {
  const [state, setState] = useState({ anchor: day, seen: day });
  let anchor = state.anchor;
  if (day !== state.seen) {
    // A new picked day: the grid stays unless the day is outside it.
    anchor = threeWeekDays(state.anchor).includes(day) ? state.anchor : day;
    setState({ anchor, seen: day });
  }
  const days = threeWeekDays(anchor);
  return {
    days,
    from: days[0] ?? day,
    to: days[days.length - 1] ?? day,
    shift: (weeks: number) => {
      // The day moves with the grid, so it lands inside the moved weeks and they hold when it arrives.
      setState({ anchor: shiftDay(anchor, weeks * 7), seen: day });
      onPickDay(shiftDay(day, weeks * 7));
    },
  };
}

export function Board({ tz, today, days, day, rows, isPending, error, onRetry, onPickDay, onShift, onOpen, selectedId }: BoardProps) {
  const counts = countByDay(rows ?? []);
  const dayRows = (rows ?? []).filter((r) => r.delivery_date === day).sort(byTime);

  return (
    <div className="flex flex-col">
      <div className="p-4">
        <ThreeWeekGrid
          days={days}
          counts={counts}
          today={today}
          selected={day}
          onPick={onPickDay}
          onShift={onShift}
          onToday={() => {
            onPickDay(today);
          }}
        />
      </div>
      <section aria-label="Day" className="border-t border-line">
        <header className="flex h-12 items-center gap-2 bg-card-head px-4">
          <h3 className="text-[15px] font-semibold text-ink">{formatDay(day, 'EEEE, MMM d')}</h3>
          {day === today ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Today</span> : null}
        </header>
        {isPending ? <LoadingState label="Loading deliveries" /> : null}
        {!isPending && error !== null ? <ErrorState error={error} onRetry={onRetry} /> : null}
        {!isPending && error === null && dayRows.length === 0 ? <EmptyState icon={TOOL_META.deliveries.icon} title="No deliveries this day." /> : null}
        {dayRows.length > 0 ? (
          <ul className="divide-y divide-line border-t border-line" data-testid="delivery-day-cards">
            {dayRows.map((r) => (
              <DeliveryCard
                key={r.id ?? r.number}
                delivery={r}
                tz={tz}
                selected={r.id !== undefined && r.id === selectedId}
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
